process.on('uncaughtException', function (err) {
  console.log(err)
  process.exit()
})

var electron = require('electron')
var openWindow = require('./lib/window')

var Path = require('path')
var defaultMenu = require('electron-default-menu')
var WindowState = require('electron-window-state')
var Menu = electron.Menu
var extend = require('xtend')
var ssbKeys = require('ssb-keys')

var windows = {
  dialogs: new Set()
}
var ssbConfig = null
var quitting = false

electron.app.on('ready', () => {
  setupContext('ssb', {
    server: !(process.argv.includes('-g') || process.argv.includes('--use-global-ssb'))
  }, () => {
    var menu = defaultMenu(electron.app, electron.shell)
    var view = menu.find(x => x.label === 'View')
    view.submenu = [
      { role: 'reload' },
      { role: 'toggledevtools' },
      { type: 'separator' },
      { role: 'resetzoom' },
      { role: 'zoomin' },
      { role: 'zoomout' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
    if (process.platform === 'darwin') {
      var win = menu.find(x => x.label === 'Window')
      win.submenu = [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close', label: 'Close' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
    Menu.setApplicationMenu(Menu.buildFromTemplate(menu))
    openMainWindow()
  })

  electron.app.on('activate', function (e) {
    if (windows.main) {
      windows.main.show()
    }
  })

  electron.app.on('before-quit', function () {
    quitting = true
  })
  
  electron.ipcMain.on('open-add-window', (ev, data) => openAddWindow(data))

  electron.ipcMain.on('open-background-devtools', function (ev, config) {
    if (windows.background) {
      windows.background.webContents.openDevTools({detach: true})
    }
  })
})

function openAddWindow (opts) {
  var window = openWindow(context, Path.join(__dirname, 'add-audio-window.js'), {
    parent: windows.main,
    show: true,
    width: 850,
    height: 350,
    useContentSize: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    resizable: false,
    title: opts && opts.id ? 'Edit Audio File' : 'Add Audio File',
    backgroundColor: '#444',
    data: opts
  })

  windows.dialogs.add(window)

  window.on('closed', function () {
    windows.dialogs.delete(window)
  })
}

function openMainWindow () {
  if (!windows.main) {
    var windowState = WindowState({
      defaultWidth: 1024,
      defaultHeight: 768
    })
    windows.main = openWindow(ssbConfig, Path.join(__dirname, 'main-window.js'), {
      minWidth: 800,
      x: windowState.x,
      y: windowState.y,
      width: windowState.width,
      height: windowState.height,
      titleBarStyle: 'hidden-inset',
      autoHideMenuBar: true,
      title: 'Patchwork',
      show: true,
      backgroundColor: '#EEE',
      webPreferences: {
        experimentalFeatures: true
      },
      icon: './assets/icon.png'
    })
    windowState.manage(windows.main)
    windows.main.setSheetOffset(40)
    windows.main.on('close', function (e) {
      if (!quitting && process.platform === 'darwin') {
        e.preventDefault()
        windows.main.hide()
      }
    })
    windows.main.on('closed', function () {
      windows.main = null
      if (process.platform !== 'darwin') electron.app.quit()
    })
  }
}

function setupContext (appName, opts, cb) {
  ssbConfig = require('ssb-config/inject')(appName, extend({
    port: 8008,
    blobsPort: 7777
  }, opts))

  ssbConfig.keys = ssbKeys.loadOrCreateSync(Path.join(ssbConfig.path, 'secret'))

  // fix offline on windows by specifying 127.0.0.1 instead of localhost (default)
  var id = ssbConfig.keys.id
  ssbConfig.remote = `net:127.0.0.1:${ssbConfig.port}~shs:${id.slice(1).replace('.ed25519', '')}`

  if (opts.server === false) {
    cb && cb()
  } else {
    electron.ipcMain.once('server-started', function (ev, config) {
      ssbConfig = config
      cb && cb()
    })
    windows.background = openWindow(ssbConfig, Path.join(__dirname, 'server-process.js'), {
      connect: false,
      center: true,
      fullscreen: false,
      fullscreenable: false,
      height: 150,
      maximizable: false,
      minimizable: false,
      resizable: false,
      show: false,
      skipTaskbar: true,
      title: 'patchwork-server',
      useContentSize: true,
      width: 150
    })
    // windows.background.on('close', (ev) => {
    //   ev.preventDefault()
    //   windows.background.hide()
    // })
  }
}
