var WebTorrent = require('webtorrent')
var electron = require('electron')
var parseTorrent = require('parse-torrent')
var Path = require('path')
var getExt = require('path').extname
var fs = require('fs')
var ipc = electron.ipcRenderer
var watch = require('@mmckegg/mutant/watch')
var Value = require('@mmckegg/mutant/value')
var watchEvent = require('./lib/watch-event')

console.log = electron.remote.getGlobal('console').log
process.exit = electron.remote.app.quit
// redirect errors to stderr
window.addEventListener('error', function (e) {
  e.preventDefault()
  console.error(e.error.stack || 'Uncaught ' + e.error)
})

var announce = [
  'ws://pub.ferment.audio:43770'
]

module.exports = function (client, config) {
  var torrentClient = new WebTorrent()
  var mediaPath = config.mediaPath
  var releases = {}
  var prioritizeReleases = []
  var paused = []
  var torrentStatuses = {}

  setInterval(pollStats, 5000)

  startSeeding()

  torrentClient.on('torrent', function (torrent) {
    var status = torrentStatuses[torrent.infoHash]
    if (!status) {
      status = Value({loading: true})
      torrentStatuses[torrent.infoHash] = status
    }

    torrent.on('download', update)
    update()

    function update () {
      status.set({
        progress: torrent.progress,
        downloadSpeed: torrent.downloadSpeed
      })
    }
  })

  ipc.on('bg-release', function (ev, id) {
    if (releases[id]) {
      var release = releases[id]
      releases[id] = null
      release()
    }
  })

  ipc.on('bg-subscribe-progress', (ev, id, torrentId) => {
    var torrent = parseTorrent(torrentId)
    addWatcherSubscription(torrent.infoHash, id)
  })

  ipc.on('bg-stream-torrent', (ev, id, torrentId) => {
    unprioritize(true, () => {
      var torrent = torrentClient.get(torrentId)
      if (torrent) {
        streamTorrent(id, torrentId)
      } else {
        addTorrent(torrentId, () => {
          streamTorrent(id, torrentId)
        })
      }
    })

    function streamTorrent (id, torrentId) {
      var torrent = torrentClient.get(torrentId)
      var server = torrent.createServer()
      prioritize(torrentId)
      server.listen(0, function (err) {
        if (err) return ipc.send('bg-response', id, err)
        var port = server.address().port
        var url = 'http://localhost:' + port + '/0'
        ipc.send('bg-response', id, null, url)
      })
      releases[id] = () => {
        server.close()
      }
    }
  })

  ipc.on('bg-check-torrent', (ev, id, torrentId) => {
    var torrent = torrentClient.get(torrentId)
    if (torrent) {
      ipc.send('bg-response', id, null)
    } else {
      addTorrent(torrentId, (err) => {
        ipc.send('bg-response', id, err)
      })
    }
  })

  ipc.on('bg-seed-torrent', (ev, id, infoHash) => {
    var torrent = torrentClient.get(infoHash)
    if (torrent) {
      ipc.send('bg-response', id, null, torrent.magnetURI)
    } else {
      torrentClient.add(getTorrentPath(infoHash), {
        path: getTorrentDataPath(infoHash),
        announce
      }, function (torrent) {
        ipc.send('bg-response', id, null, torrent.magnetURI)
      })
    }
  })

  ipc.send('ipcBackgroundReady', true)

  // scoped

  function pollStats () {
    ipc.send('bg-torrent-stats', {
      progress: torrentClient.progress,
      down: torrentClient.downloadSpeed,
      up: torrentClient.uploadSpeed
    })
  }

  function getTorrentPath (infoHash) {
    return `${getTorrentDataPath(infoHash)}.torrent`
  }

  function getTorrentDataPath (infoHash) {
    return Path.join(mediaPath, `${infoHash}`)
  }

  function addTorrent (torrentId, cb) {
    var torrent = parseTorrent(torrentId)
    var torrentPath = getTorrentPath(torrent.infoHash)

    torrentClient.add(torrent, {
      path: getTorrentDataPath(torrent.infoHash),
      announce
    }, function (torrent) {
      console.log('add torrent', torrent.infoHash)
      fs.writeFile(torrentPath, torrent.torrentFile, cb)
    })
  }

  function startSeeding () {
    fs.readdir(mediaPath, function (err, entries) {
      if (err) throw err
      entries.forEach((name) => {
        if (getExt(name) === '.torrent') {
          torrentClient.add(Path.join(mediaPath, name), {
            path: getTorrentDataPath(Path.basename(name, '.torrent')),
            announce
          }, (torrent) => {
            console.log('seeding', name)
          })
        }
      })
    })
  }

  function unprioritize (restart, cb) {
    while (prioritizeReleases.length) {
      prioritizeReleases.pop()()
    }

    if (paused.length && restart) {
      var remaining = paused.length
      console.log(`restarting ${paused.length} torrent(s)`)
      while (paused.length) {
        var torrentFile = paused.pop()
        torrentClient.add(torrentFile, { path: mediaPath, announce }, (torrent) => {
          remaining -= 1
          if (remaining === 0) {
            cb && cb()
          }
        })
      }
    } else {
      cb && cb()
    }
  }

  function prioritize (torrentId) {
    var torrent = torrentClient.get(torrentId)
    torrent.critical(0, Math.floor(torrent.pieces.length / 8))
    if (torrent.progress < 0.5) {
      torrentClient.torrents.forEach(function (t) {
        if (t !== torrent && t.progress < 0.9) {
          paused.push(t.torrentFile)
          torrentStatuses[t.infoHash].set({paused: true})
          t.destroy()
        }
      })

      console.log(`pausing ${paused.length} torrent(s)`)

      prioritizeReleases.push(watchEvent(torrent, 'download', () => {
        if (torrent.progress > 0.8) {
          unprioritize(true)
        }
      }))
    }
  }

  function addWatcherSubscription (infoHash, id) {
    var status = torrentStatuses[infoHash]

    if (!status) {
      status = Value({loading: true})
      torrentStatuses[infoHash] = status
    }

    releases[id] = watch(status, (value) => {
      ipc.send('bg-multi-response', id, value)
    })
  }
}
