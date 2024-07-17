const { program } = require('commander')
const path = require('path')
const { DomainProcessor } = require('./loader')
const { ConfigLoader } = require('./configLoader')

// Configure command line options
program
  .name('Celebmeter Scraper')
  .description('Scraper to load newspaper and pages information to evaluate celebrity references.')
  .version('0.1.0')

program.option(
  '-c, --configurations <configuration path>',
  'System configuration file path',
  'config.yaml',
)
program.option(
  '-a, --action <continue|clear|restart|drop>',
  'Action to be taken by crawler',
  'continue',
)
program.parse()

const O = program.opts()

console.log('Config path: ', O)

// Load configuration file:
const config = new ConfigLoader(O.configurations)
config
  .load()
  .then((res) => {
    console.log('Configuration loaded. Starting processing')
    run(res)
  })
  .catch((err) => {
    console.error('Unable to load configuration: ', err)
  })

async function run(configurations) {
  // Initialize database:
  const d = configurations.database
  const knex = require('knex')({
    client: d.client,
    connection: {
      host: d.host,
      port: d.port,
      user: d.user,
      password: d.password,
      database: d.database,
    },
  })
  const o = configurations.crawler
  const u = configurations.dump
  const processor = new DomainProcessor(
    // Website URL:
    o.root,
    // Dump files directory:
    `${u.root}/${u.path}`.replaceAll(/\/{2,}/g, '/'),
    o.robots,
    o.sitemaps,
    0,
    o.depth,
    knex,
  )
  if (O.action == 'continue') {
    processor.evaluate()
  }
}
