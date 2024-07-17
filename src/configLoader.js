const yaml = require('js-yaml')
const fs = require('fs')

function readFile(path) {
  return new Promise(function (resolve, reject) {
    fs.readFile(path, 'utf8', (err, data) => {
      if (err) {
        reject(err.message)
      } else {
        resolve(data)
      }
    })
    fs
  })
}

class ConfigLoader {
  constructor(path) {
    console.log('Loading configurations - path: ', path)
    this.path = path
  }
  async load() {
    const data = yaml.load(await readFile(this.path))
    return data
  }
}

exports.ConfigLoader = ConfigLoader
