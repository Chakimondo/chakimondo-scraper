const axios = require('axios')
const robotsParser = require('robots-parser')
const puppeteer = require('puppeteer')
const Sitemapper = require('sitemapper')
const moment = require('moment')
const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const HOME = process.env.HOME
const SAVING_DIRECTORY = path.join(HOME, '.kronodynamic-crawl', 'database')

class DomainProcessor {
  constructor({
    url,
    savingDirectory = SAVING_DIRECTORY,
    tryRobots = false,
    trySitemaps = false,
    startLevel = 0,
    // The scan span increases exponentially, with high factors (higher the 100) - the
    // idea of the scraper is a broad shallow search, so deep searchs will not be encouraged
    // at this moment, unless lots of resources, in the future, are available:
    deepestLevel = 9,
    knex,
  }) {
    this.url = url
    this.savingDirectory = savingDirectory
    // Remove hrefQueue to identify all places to dump link data to database
    // (later, remove it completely from code):
    // this.hrefQueue = []
    this.tryRobots = tryRobots
    this.trySitemaps = trySitemaps
    this.startLevel = startLevel
    this.deepestLevel = deepestLevel
    this.processedPages = new Set()
    this.tagOutputBuffer = []
    this.limitBufferSize = 10000
    this.knex = knex
    this.sitemaps = [`${this.url}`] // With default sitemap
    this.crawlerId
  }
  async evaluate() {
    // Create the directory here
    try {
      await fs.promises.mkdir(this.savingDirectory, { recursive: true })
    } catch (e) {
      console.log('Unable to create savingDirectory. Going on:', e)
    }

    // Finally, process domain:
    await this.processDomain()
  }

  async processRobots() {
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
        console.log('Processing robots: ', robots)
        this.robotsParser = robotsParser(robots, req.data)
        const sitemaps = this.robotsParser.getSitemaps()
        // Add prospected sitemaps:
        if (sitemaps.length !== 0) {
          this.sitemaps = this.sitemaps.concat(sitemaps)
        }
      }
    }
  }

  async processSitemaps(trx) {
    if (this.trySitemaps) {
      console.log('Trying to process sitemaps: ', this.url + '/sitemap.xml')
      for await (const sitemap of this.sitemaps) {
        await this.processSitemap(sitemap, trx)
      }
    }
  }

  async startDomain(trx) {
    console.log('Processing home page...')
    // Add root domain:
    const res = await trx('crawler').insert({ root_path: this.url, status: 'idle' }, ['id'])
    this.crawlerId = res[0].id

    // Add first page, the domain home page, which will be processed later:
    const linkData = {
      path: this.url,
      status: 'fresh',
      level: this.startLevel,
      crawler_id: this.crawlerId,
      origin: '<ROOT>',
    }
    const lres = await trx('link').insert(linkData, ['id'])
    linkData.id = lres[0].id
  }

  async initializeDomain(trx) {
    await this.startDomain(trx)
    // Evaluate robots and sitemaps if necessary:
    await this.processRobots()
    await this.processSitemaps(trx)
  }

  async abortProcessing() {
    console.log('Trying to continue...')

    // Continue processing only if crawler status is idle:
    const res = await this.knex('crawler')
      .where('root_path', this.url)
      .andWhere('status', 'idle')
      .update({
        status: 'processing',
        // TODO: update updated_at field here.
      })

    return res == 0
  }

  async processDomain() {
    const trx = await this.knex.transaction()
    try {
      await this.initializeDomain(trx)
      await trx.commit()
    } catch (e) {
      console.error(e)
      console.log('Unable to initialize domain crawling.')
      await trx.rollback()
    }

    if (await this.abortProcessing()) {
      console.log('An instance is running yet. Aborting.')
      return
    }

    console.log('Continuing...')

    // // Start to process website contents:
    // while (this.hrefQueue.length > 0) {
    //   // TODO: Save processing state here, to recover in case of processing crash

    //   // Extract link from start of the queue:
    //   const link = this.hrefQueue.shift()
    //   let processSuccesful = false

    //   if (this.verifyLevel(link) && this.verifyDomain(link) && this.verifyVisited(link)) {
    //     // Process link, increasing the level. New found links below the maximum level are added to hrefQueue
    //     processSuccesful = await this.processPage(link.url, link.level)
    //     // Sleep some random time, to avoid remote server overloading.
    //     const wait = (650 + 700 * Math.random()) | 0
    //     console.log('Wating between pages: ', wait)
    //     await sleep(wait)
    //   }
    //   // Otherwise, just ignore the link completely - links pointing outside the domain are ignored

    //   // Set the page as already processed:
    //   if (processSuccesful) {
    //     this.processedPages.add(link.url)
    //   } else {
    //     // TODO: create criterion to re-enqueue the unprocessed link.
    //     // To simply re-enqueue in case of error will make the system to run forever in case of a dead link
    //   }
    // }

    // // write output file here
    // this.persistOutputBuffer()
  }

  async processPage({ linkData, trx, skipBuffer = new Set() }) {
    // Load data from link, using link_id and trx:
    const url = linkData['path']
    const level = linkData['level']
    const linkId = linkData['id']

    console.log('Processing Page: ', link_data)
    // Initialize page object to process page:
    const browser = await puppeteer.launch()
    const page = await browser.newPage()
    let success = false
    let newSkipBuffer = new Set()

    try {
      // Waits at most 30 seconds - to avoid infinite hangouts:
      page.setDefaultTimeout(30000)
      page.setDefaultNavigationTimeout(30000)
      // Crawler prepared to load static pages - huge viewport is irrelevant, so use a standard one:
      await page.setViewport({ width: 1280, height: 1080 })
      await page.goto(url, { waitUntil: 'load' })

      // Continue processing data resources:
      const resources = await page.evaluate(
        (level, deepestLevel, m) => {
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
              })
            }
          }
          res.text = []
          res.text.push(...extractText(document.body))
          return res
        },
        level,
        this.deepestLevel,
        moment().utc().format(),
      )
      // Add new links to database here:
      // this.hrefQueue.push(...resources.links)
      newSkipBuffer = await this.registerNewLinks({
        links: resources.links,
        newLevel: level + 1,
        trx,
        skipBuffer,
        origin: url,
      })
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
      await page.close()
      await browser.close()
    } catch (exception) {
      console.log('Error closing page: ', exception)
    }

    // Finish processing page status here:
    if (success) {
      await trx('link').where('id', linkId).update('status', 'processed')
    }

    return { success, skipBuffer: new Set([...skipBuffer, ...newSkipBuffer]) }
  }

  async registerNewLinks({ links, newLevel, trx, skipBuffer = new Set(), origin }) {
    // 1. Register links in a set, to remove duplicated ones
    const linkSet = new Set(links.map((l) => l.url))

    // 2. For each link in the set:
    for (let l of linkSet) {
      // 2.1. Verify if object is in database
      const link = await trx('link').where('path', l).select('id')
      if (link.length == 0 && !skipBuffer.has(l)) {
        // 2.2. If it's not, register it in database:
        await trx('link').insert({
          path: l,
          status: 'fresh',
          level: newLevel,
          crawler_id: BigInt(this.crawlerId),
          origin,
        })
      }
    }

    // Return incremented skip buffer:
    return new Set([...skipBuffer, ...linkSet])
  }

  async processSitemap(sitemap, trx) {
    const registerSet = []
    console.log('Sitemap: ', sitemap)
    const sitemapper = new Sitemapper()
    try {
      const { sites } = await sitemapper.fetch(sitemap)
      for (let s of sites) {
        registerSet.push({ url: s })
      }
    } catch (e) {
      console.log('Error processing sitemap: ', sitemap)
      console.log('Skipping.')
    }

    if (registerSet.length > 0) {
      await this.registerNewLinks({
        links: registerSet,
        newLevel: 1,
        trx,
        origin: sitemap,
      })
    }
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
