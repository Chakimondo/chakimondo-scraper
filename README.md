# Kronodynamic Scraper

Scraper to load basic static text from websites. Not suitable to dynamic (with lots of Javascript dynamic content) webpages. The best example of such type of website is Wikipedia.

This scraper focus on load plain text from body paragraphs, dumping only text encased by **p** html tags.

## Usage:

```sh
npx node src/index.js -u 'https://pt.wikipedia.org'
```

# TODO:

- Change direct file management to Database based management: use [Knex query builder](https://github.com/knex/knex).
- Develop database model, configuration and migrations.
- Change direct html parser to [Cheerio Library](https://github.com/cheeriojs/cheerio).
