var Path = require('path')
var fs = require('fs')
var ssbKeys = require('ssb-keys')
var extend = require('xtend')

module.exports = function (appName, opts) {
  var ssbConfig = require('ssb-config/inject')(appName, extend({
    port: 43761,
    trackerPort: 43770,
    blobsPort: 1024 + (~~(Math.random() * (65536 - 1024))),
    friends: {
      scope: 'ferment'
    }
  }, opts))

  ssbConfig.mediaPath = Path.join(ssbConfig.path, 'media')
  ssbConfig.keys = ssbKeys.loadOrCreateSync(Path.join(ssbConfig.path, 'secret'))

  if (!fs.existsSync(ssbConfig.mediaPath)) {
    fs.mkdirSync(ssbConfig.mediaPath)
  }

  return ssbConfig
}
