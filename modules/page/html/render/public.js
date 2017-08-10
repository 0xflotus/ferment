var nest = require('depnest')
var extend = require('xtend')
var pull = require('pull-stream')
var normalizeChannel = require('../../../../lib/normalize-channel')
var { h, send, when, computed, map } = require('mutant')

exports.needs = nest({
  sbot: {
    obs: {
      connectedPeers: 'first',
      localPeers: 'first'
    }
  },
  'sbot.pull.stream': 'first',
  'feed.pull.public': 'first',
  'about.html.image': 'first',
  'about.obs.name': 'first',
  'invite.sheet': 'first',

  'message.html.compose': 'first',
  'message.async.publish': 'first',
  'progress.html.peer': 'first',

  'feed.html.rollup': 'first',
  'profile.obs.recentlyUpdated': 'first',
  'contact.obs.following': 'first',
  'channel.obs': {
    subscribed: 'first',
    recent: 'first'
  },
  'keys.sync.id': 'first'
})

exports.gives = nest({
  'page.html.render': true
})

exports.create = function (api) {
  return nest('page.html.render', page)

  function page (path) {
    if (path !== '/public') return // "/" is a sigil for "page"

    var id = api.keys.sync.id()
    var following = api.contact.obs.following(id)
    var subscribedChannels = api.channel.obs.subscribed(id)
    var recentChannels = api.channel.obs.recent()
    var loading = computed([subscribedChannels.sync, recentChannels.sync], (...args) => !args.every(Boolean))
    var channels = computed(recentChannels, items => items.slice(0, 8), {comparer: arrayEq})
    var connectedPeers = api.sbot.obs.connectedPeers()
    var localPeers = api.sbot.obs.localPeers()
    var connectedPubs = computed([connectedPeers, localPeers], (c, l) => c.filter(x => !l.includes(x)))

    var prepend = [
      api.message.html.compose({ meta: { type: 'post' }, placeholder: 'Write a public message' })
    ]

    var getStream = (opts) => {
      if (opts.lt != null && !opts.lt.marker) {
        // if an lt has been specified that is not a marker, assume stream is finished
        return pull.empty()
      } else {
        return api.sbot.pull.stream(sbot => sbot.patchwork.roots(extend(opts, { ids: [id] })))
      }
    }

    var feedView = api.feed.html.rollup(getStream, {
      prepend,
      updateStream: api.sbot.pull.stream(sbot => sbot.patchwork.latest({ids: [id]})),
      bumpFilter: function (msg) {
        if (msg.value && msg.value.content && typeof msg.value.content === 'object') {
          var type = msg.value.content.type
          if (type === 'vote') return false

          var author = msg.value.author
          var channel = normalizeChannel(msg.value.content.channel)
          var isSubscribed = channel ? subscribedChannels().has(channel) : false
          return isSubscribed || id === author || following().has(author)
        }
      },
      waitFor: computed([
        following.sync,
        subscribedChannels.sync
      ], (...x) => x.every(Boolean))
    })

    var result = h('div.SplitView', [
      h('div.side', [
        getSidebar()
      ]),
      h('div.main', feedView)
    ])

    result.pendingUpdates = feedView.pendingUpdates
    result.reload = feedView.reload

    return result

    function getSidebar () {
      var whoToFollow = computed([following, api.profile.obs.recentlyUpdated(), localPeers], (following, recent, peers) => {
        return recent.filter(x => x !== id && !following.has(x) && !peers.includes(x)).slice(0, 10)
      })
      return [
        h('button -pub -full', {
          'ev-click': api.invite.sheet
        }, '+ Join Pub'),
        when(loading, [ h('Loading') ], [

        ]),

        PeerList(localPeers, 'Local'),
        PeerList(connectedPubs, 'Connected Pubs'),

        when(computed(whoToFollow, x => x.length), h('h2', 'Who to follow')),
        when(following.sync,
          h('div', {
            classList: 'ProfileList'
          }, [
            map(whoToFollow, (id) => {
              return h('a.profile', {
                href: id
              }, [
                h('div.avatar', [api.about.html.image(id)]),
                h('div.main', [
                  h('div.name', [ api.about.obs.name(id) ])
                ])
              ])
            })
          ])
        )
      ]
    }

    function PeerList (ids, title) {
      return [
        when(computed(ids, x => x.length), h('h2', title)),
        h('div', {
          classList: 'ProfileList'
        }, [
          map(ids, (id) => {
            var connected = computed([connectedPeers, id], (peers, id) => peers.includes(id))
            return h('a.profile', {
              classList: [
                when(connected, '-connected')
              ],
              href: id
            }, [
              h('div.avatar', [api.about.html.image(id)]),
              h('div.main', [
                h('div.name', [ api.about.obs.name(id) ])
              ]),
              h('div.progress', [
                api.progress.html.peer(id)
              ])
            ])
          })
        ])
      ]
    }

    function subscribe (id) {
      api.message.async.publish({
        type: 'channel',
        channel: id,
        subscribed: true
      })
    }

    function unsubscribe (id) {
      api.message.async.publish({
        type: 'channel',
        channel: id,
        subscribed: false
      })
    }
  }
}

function arrayEq (a, b) {
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a !== b) {
    return a.every((value, i) => value === b[i])
  }
}
