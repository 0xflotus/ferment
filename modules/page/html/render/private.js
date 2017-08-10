var nest = require('depnest')
var ref = require('ssb-ref')

exports.needs = nest({
  'feed.html.rollup': 'first',
  'feed.pull.private': 'first',
  'message.html.compose': 'first',
  'keys.sync.id': 'first'
})

exports.gives = nest('page.html.render')

exports.create = function (api) {
  return nest('page.html.render', function channel (path) {
    if (path !== '/private') return

    var id = api.keys.sync.id()
    var prepend = [
      api.message.html.compose({
        meta: {type: 'post'},
        prepublish: function (msg) {
          msg.recps = [id].concat(msg.mentions).filter(function (e) {
            return ref.isFeed(typeof e === 'string' ? e : e.link)
          })
          return msg
        },
        placeholder: `Post a private track \n\n\n\nThis track can only be seen by yourself and people you have @mentioned.`
      })
    ]

    return api.feed.html.rollup(api.feed.pull.private, { prepend })
  })
}
