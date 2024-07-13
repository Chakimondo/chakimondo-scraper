const { program } = require('commander')
const path = require('path')
const { DomainProcessor } = require('./loader')
const HOME = process.env.HOME

// Configure command line options
program
  .name('Celebmeter Scraper')
  .description('Scraper to load newspaper and pages information to evaluate celebrity references.')
  .version('0.0.0')

program.requiredOption('-u, --url <url>', 'Domain main site')
program.option('-r, --robots [robots]', 'Use robots.txt file', 'false')
program.option('-S, --sitemaps [sitemaps]', 'Use sitemaps to crawl', 'false')
program.option('-d, --depth [depth]', 'Crawling linking search depth from website root.', '0')
program.option(
  '-s, --saving-directory <directory>',
  path.join(HOME, '.kronodynamic-crawl', 'database'),
)
program.parse()

const O = program.opts()

// Load file with set of websites to be scraped
const processor = new DomainProcessor(
  O.url,
  O.directory,
  O.robots !== 'false',
  O.sitemaps !== 'false',
  0,
  parseInt(O.depth),
)
// Evaluate all page content:
processor.evaluate()
