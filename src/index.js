const { program } = require('commander')
const path = require('path')
const { DomainProcessor } = require('./loader')
const HOME = process.env.HOME

// Configure command line options
program
  .name('Celebmeter Scraper')
  .description('Scraper to load newspaper and pages information to evaluate celebrity references.')
  .version('0.1.0')

program.requiredOption(
  '-c, --configurations <configuration path>',
  'System configuration file path',
)
// program.requiredOption('-u, --url <url>', 'Domain main site')
// program.option('-r, --robots [robots]', 'Use robots.txt file', 'false')
// program.option('-S, --sitemaps [sitemaps]', 'Use sitemaps to crawl', 'false')
// program.option('-d, --depth [depth]', 'Crawling linking search depth from website root.', '9')
// program.option(
//   '-s, --saving-directory <directory>',
//   path.join(HOME, '.kronodynamic-crawl', 'database'),
// )
// program.option('-D, --drop', 'Drop current crawler from database')
// program.option('-c, --clear', 'Clear previous downloaded data from crawling, restarting it.')
// program.option('-R, --restart', 'Restart crawling process, but maintain previously downloaded data')
program.parse()

const O = program.opts()

console.log('Config path: ', O.configurations)

// To use database connection: PostgreSQL - host: localhost, user: kronodynamic, password: krono

// Load file with set of websites to be scraped
// const processor = new DomainProcessor(
//   O.url,
//   O.directory,
//   O.robots !== 'false',
//   O.sitemaps !== 'false',
//   0,
//   parseInt(O.depth),
// )
// // Evaluate all page content:
// processor.evaluate()
