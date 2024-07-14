const axios = require('axios')
const robotsParser = require('robots-parser')
const sitemapStreamParser = require('sitemap-stream-parser')
const puppeteer = require('puppeteer')
const moment = require('moment')
const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const HOME = process.env.HOME
const SAVING_DIRECTORY = path.join(HOME, '.kronodynamic-crawl', 'database')

class DomainProcessor {
  constructor(
    url,
    savingDirectory = SAVING_DIRECTORY,
    tryRobots = false,
    trySitemaps = false,
    startLevel = 0,
    // The scan span increases exponentially, with high factors (higher the 100) - the
    // idea of the scraper is a broad shallow search, so deep searchs will not be encouraged
    // at this moment, unless lots of resources, in the future, are available:
    deepestLevel = 9,
  ) {
    this.url = url
    this.savingDirectory = savingDirectory
    this.hrefQueue = []
    this.browser = null
    this.tryRobots = tryRobots
    this.trySitemaps = trySitemaps
    this.startLevel = startLevel
    this.deepestLevel = deepestLevel
    this.processedPages = new Set()
    this.tagOutputBuffer = []
    this.limitBufferSize = 10000
  }
  async evaluate() {
    // Create the directory here
    try {
      await fs.promises.mkdir(this.savingDirectory, { recursive: true })
    } catch (e) {
      console.log('Unable to create savingDirectory. Going on:', e)
    }

    // Initialize puppeteer, if it's not initialized:
    if (this.browser === null) {
      this.browser = await puppeteer.launch()
    }
    if (this.tryRobots) {
      const robots = `${this.url}/robots.txt`
      let req = null
      let tries = 0

      while (tries < 3) {
        try {
          req = await axios({
            url: robots,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (X11; Linux x86_64; rv:103.0) Gecko/20100101 Firefox/103.0',
            },
          })
          tries = 3
        } catch (exception) {
          console.log('Unable to process robots.txt')
          console.log('Error: ', exception)
          req = null
          console.log('Failed to load Robots.txt. Waiting 20 seconds and trying again.')
          // Sleep twenty seconds:
          await sleep(20000)
          tries++
        }
      }
      if (req && req.status <= 299 && req.status >= 200) {
        await this.processDomain(this.url, robots, req.data)
      } else {
        await this.processDomain(this.url)
      }
    } else {
      await this.processDomain(this.url)
    }
    await this.browser.close()
    this.browser = null
  }

  async processDomain(domain, robots, contents) {
    console.log('Processing home page...')
    await this.processPage(domain, this.startLevel)
    this.processedPages.add(domain)
    if (robots && contents) {
      console.log('Processing robots: ', robots)
      this.robotsParser = robotsParser(robots, contents)
      const sitemaps = this.robotsParser.getSitemaps()
      console.log('Process the front-page (level 0) links and crawl it')
      if (sitemaps.length === 0) {
        // Add default sitemap:
        sitemaps.push(domain + '/sitemap.xml')
      }
      if (this.trySitemaps) {
        console.log('Trying to process sitemaps: ', domain + '/sitemap.xml')
        for await (const sitemap of sitemaps) {
          await this.processSitemap(sitemap)
          console.log('This is the total of links: ', this.hrefQueue.length)
        }
      }
    } else {
      if (this.trySitemaps) {
        // Try to process default sitemap:
        console.log('Trying to process default sitemap: ', domain + '/sitemap.xml')
        await this.processSitemap(domain + '/sitemap.xml')
      }
    }

    // Start to process contents:
    while (this.hrefQueue.length > 0) {
      // TODO: Save processing state here, to recover in case of processing crash

      // Extract link from start of the queue:
      const link = this.hrefQueue.shift()
      let processSuccesful = false

      if (this.verifyLevel(link) && this.verifyDomain(link) && this.verifyVisited(link)) {
        // Process link, increasing the level. New found links below the maximum level are added to hrefQueue
        processSuccesful = await this.processPage(link.url, link.level)
        // Sleep some random time, to avoid remote server overloading.
        const wait = (650 + 700 * Math.random()) | 0
        console.log('Wating between pages: ', wait)
        await sleep(wait)
      }
      // Otherwise, just ignore the link completely - links pointing outside the domain are ignored

      // Set the page as already processed:
      if (processSuccesful) {
        this.processedPages.add(link.url)
      } else {
        // TODO: create criterion to re-enqueue the unprocessed link.
        // To simply re-enqueue in case of error will make the system to run forever in case of a dead link
      }
    }

    // write output file here
    this.persistOutputBuffer()
  }

  async processPage(url, level) {
    console.log('Processing Page: ', url)
    // Initialize page object to process page:
    const page = await this.browser.newPage()
    let success = false
    try {
      // Waits at most 30 seconds - to avoid infinite hangouts:
      page.setDefaultTimeout(30000)
      page.setDefaultNavigationTimeout(30000)
      // Crawler prepared to load static pages - huge viewport is irrelevant, so use a standard one:
      await page.setViewport({ width: 1280, height: 1080 })
      await page.goto(url, { waitUntil: 'load' })

      // Continue processing data resources:
      const resources = await page.evaluate(
        (level, deepestLevel, url, m) => {
          function extractText(node) {
            const children = Array.from(node.children)
            const res = []
            children.forEach((c) => {
              if (c.innerText) {
                const innerText = c.innerText.trim()
                if (
                  // Download only relevant paragraph data (which belong to relevant text corpus)
                  innerText !== '' &&
                  c.tagName.toLowerCase() === 'p'
                ) {
                  res.push({
                    tag: c.tagName,
                    text: innerText,
                    level: level,
                    source: url,
                    utcDate: m,
                  })
                }
              }
              if (c.children.length > 0) {
                res.push(...extractText(c))
              }
            })
            return res
          }
          const res = { links: [] }
          if (level < deepestLevel) {
            const links = document.getElementsByTagName('a')
            for (let i = 0; i < links.length; i++) {
              const link = links.item(i)
              const processedUrl = new URL(link.getAttribute('href'), url)
              res.links.push({
                url: processedUrl.href,
                text: link.innerText,
                level: level + 1,
                origin: url,
              })
            }
          }
          res.text = []
          res.text.push(...extractText(document.body))
          return res
        },
        level,
        this.deepestLevel,
        url,
        moment().utc().format(),
      )
      this.hrefQueue.push(...resources.links)
      resources.text.forEach((r) => this.writeOutput(r))
      console.log('Processed Page.')
      console.log('This is the total of links: ', this.hrefQueue.length)
      console.log('Current buffer size: ', this.tagOutputBuffer.length)
      console.log(
        'Items to download before persisting: ',
        this.limitBufferSize - this.tagOutputBuffer.length,
      )
      console.log()
      success = true
    } catch (exception) {
      console.log('Unable to process page: ', exception)
    }

    try {
      page.close()
    } catch (exception) {
      console.log('Error closing page: ', exception)
    }

    return success
  }

  processSitemap(sitemap) {
    // TODO: The SiteMapStreamParser library is innefficient. Replace it by a custom one, developed internally.
    return new Promise((resolve, reject) => {
      console.log('Sitemap: ', sitemap)
      sitemapStreamParser.parseSitemaps(
        sitemap,
        (url) => {
          // Process urls and set level = 1 - sitemap pages are
          // not considered first level:
          const l = { level: 1, url: url, origin: sitemap }
          this.hrefQueue.push(l)
        },
        (err, smps) => {
          console.log('Processed Sitemap.')
          resolve(true)
        },
      )
    })
  }

  verifyDomain(link) {
    // Compare domain with this.url domain to verify if link is internal to domain
    // or from a subdomain
    try {
      const localUrl = new URL(this.url)
      const linkUrl = new URL(link.url)

      console.log('Verifying link domain: ', linkUrl.host, 'Versus local domain: ', localUrl.host)
      const base = linkUrl.host.substr(linkUrl.host.length - localUrl.host.length)
      const isSubdomain = base === localUrl.host
      console.log(linkUrl.host, 'is subdomain of', localUrl.host, ': ', isSubdomain)
      return isSubdomain
    } catch {
      console.log('Problematic link: ', link)
      return false
    }
  }

  verifyVisited(link) {
    // Verify if the given link has already been visited.
    // If yes, return false (don't process the link again)
    const res = !this.processedPages.has(link.url)
    console.log('Verifying if link', link.url, 'is not visited:', res)
    return res
  }

  verifyLevel(link) {
    const ignore = link.level <= this.deepestLevel
    console.log('Verifying link', link.url, 'level: ', link.level, 'Proceed: ', ignore)
    return ignore
  }

  writeOutput(o) {
    this.tagOutputBuffer.push(JSON.stringify(o))
    if (this.tagOutputBuffer.length >= this.limitBufferSize) {
      // Write output to file.
      this.persistOutputBuffer()
    }
  }

  persistOutputBuffer() {
    try {
      const fname = path.join(
        this.savingDirectory,
        this.url.replace(new RegExp('/', 'g'), '_SLASH_').replace(/\:/g, '_COLON_') +
          '_EOURL_' +
          moment.utc().format() +
          '.txt',
      )
      fs.writeFileSync(fname, this.tagOutputBuffer.join('\n'))
      exec(`bzip2 --best ${fname}`)
    } catch (exception) {
      console.log('Unable to write file: ', exception)
    }
    // Reset output buffer
    this.tagOutputBuffer = []
  }
}

exports.DomainProcessor = DomainProcessor
