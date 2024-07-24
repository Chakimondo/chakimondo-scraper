const { exit } = require('process')
const { program } = require('commander')
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

// Load configuration file:
const config = new ConfigLoader(O.configurations)
config
  .load()
  .then(async (res) => {
    console.log('Configuration loaded. Starting processing')
    await run(res)
    exit(0)
  })
  .catch((err) => {
    console.error('Unable to load configuration: ', err)
    exit(1)
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
  const processor = new DomainProcessor({
    // Website URL:
    url: o.root,
    // Dump files directory:
    savingDirectory: `${u.root}/${u.path}`.replaceAll(/\/{2,}/g, '/'),
    tryRobots: o.robots,
    trySitemaps: o.sitemaps,
    startLevel: 0,
    deepestLevel: o.depth,
    knex,
  })
  switch (O.action) {
    case 'continue':
      await processor.evaluate()
      break
    case 'clear':
      await processor.clear()
      await processor.evaluate()
      break
    case 'restart':
      await processor.drop()
      await processor.evaluate()
      break
    case 'drop':
      await processor.drop()
      break
  }
}
