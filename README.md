# Kronodynamic Scraper

Scraper to load basic static and dynamic text from websites.

Currently, this scraper focus on load plain text from body paragraphs, dumping only text encased by **p** html tags.

## Install:

Prepare a database called `kronodynamic`, with user `kronodynamic`, password `krono` on a local PosgreSQL database. This configuration can be changed on `knexfile.js` and on `config.yml` files.

Configure your crawler on `config.yml` file.

Then install all packages:

```sh
# Install yarn globally, so the project can respect yarn.lock instructions:
npm install -g yarn

# Install dependencies.
yarn
```

This project is pure Javascript without no dependencies from other platforms. But it depends on [Puppeteer](https://pptr.dev/), to load dynamic websites correctly. Verify if your platform supports Puppeteer properly.

## Usage:

After proper installation:

```sh
npx node src/index.js -u 'https://pt.wikipedia.org'
```

# TODO:

- Add html filter properties to configuration file, since, currently, to change the filters, it's needed to edit source code.
- Change direct html parser to [Cheerio Library](https://github.com/cheeriojs/cheerio), to suitably support custom filters.
- Implement kill signal capture and graceful exit.
- Implement and test support to other databases other than PostgreSQL (MySQL/MariaDB/SQLite being the primary options).
- Implement dump text to database as a secondary option.
