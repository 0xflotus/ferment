var electron = require('electron')
var Menu = electron.remote.Menu
var MenuItem = electron.remote.MenuItem
var BrowserWindow = electron.remote.BrowserWindow

window.addEventListener('contextmenu', function (e) {
  module.exports(null, null, e)
}, false)

module.exports = function (context, item, ev) {
  ev.preventDefault()
  ev.stopPropagation()
  var menu = new Menu()
  menu.append(new MenuItem({
    label: 'Inspect Element',
    click: function () {
      var x = ev.clientX
      var y = ev.clientY
      BrowserWindow.getFocusedWindow().inspectElement(x, y)
    }
  }))
  menu.append(new MenuItem({
    label: 'Inspect Background Process',
    click: function () {
      electron.ipcRenderer.send('open-background-devtools')
    }
  }))

  if (item && item.id) {
    menu.append(new MenuItem({
      label: 'Copy SSB ID',
      click: function () {
        electron.clipboard.writeText(item.id)
      }
    }))
  }

  menu.popup(electron.remote.getCurrentWindow())
}
