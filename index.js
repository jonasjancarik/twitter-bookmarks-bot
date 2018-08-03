require('dotenv').config()
var Twitter = require('twitter')
var _ = require('lodash')

// required scripts
const db = require('./scripts/db')

// data models
var User = require('./models/user')

// var options = {
//   test: false
// }

// if (options.test) {
//   var tweet = { 'created_at': 'Tue Jul 31 14:26:24 +0000 2018', 'id': 1024300250125742100, 'id_str': '1024300250125742080', 'text': '@save_this', 'source': '<a href="http://twitter.com" rel="nofollow">Twitter Web Client</a>', 'truncated': false, 'in_reply_to_status_id': 1024003875655884800, 'in_reply_to_status_id_str': '1024003875655884800', 'in_reply_to_user_id': 20233791, 'in_reply_to_user_id_str': '20233791', 'in_reply_to_screen_name': 'JonasJancarik', 'user': { 'id': 20233791, 'id_str': '20233791', 'name': 'Jonáš Jančařík', 'screen_name': 'JonasJancarik', 'location': 'Brussels', 'url': null, 'description': "Technologist @ECThinkTank, @EU_Commission's think tank. 🇪🇺  \nUsed to crunch social media data at DG Comm", 'translator_type': 'none', 'protected': false, 'verified': false, 'followers_count': 857, 'friends_count': 923, 'listed_count': 72, 'favourites_count': 1646, 'statuses_count': 1799, 'created_at': 'Fri Feb 06 12:41:52 +0000 2009', 'utc_offset': null, 'time_zone': null, 'geo_enabled': true, 'lang': 'en-gb', 'contributors_enabled': false, 'is_translator': false, 'profile_background_color': 'C0DEED', 'profile_background_image_url': 'http://abs.twimg.com/images/themes/theme1/bg.png', 'profile_background_image_url_https': 'https://abs.twimg.com/images/themes/theme1/bg.png', 'profile_background_tile': true, 'profile_link_color': 'C21111', 'profile_sidebar_border_color': 'FFFFFF', 'profile_sidebar_fill_color': 'DDEEF6', 'profile_text_color': '333333', 'profile_use_background_image': true, 'profile_image_url': 'http://pbs.twimg.com/profile_images/976877997419565056/8Owbe9FN_normal.jpg', 'profile_image_url_https': 'https://pbs.twimg.com/profile_images/976877997419565056/8Owbe9FN_normal.jpg', 'profile_banner_url': 'https://pbs.twimg.com/profile_banners/20233791/1428444150', 'default_profile': false, 'default_profile_image': false, 'following': null, 'follow_request_sent': null, 'notifications': null }, 'geo': null, 'coordinates': null, 'place': null, 'contributors': null, 'is_quote_status': false, 'quote_count': 0, 'reply_count': 0, 'retweet_count': 0, 'favorite_count': 0, 'entities': { 'hashtags': [], 'urls': [], 'user_mentions': [{ 'screen_name': 'save_this', 'name': 'bkmrk bot', 'id': 1024288296116084700, 'id_str': '1024288296116084736', 'indices': [0, 10] }], 'symbols': [] }, 'favorited': false, 'retweeted': false, 'filter_level': 'low', 'lang': 'und', 'timestamp_ms': '1533047184865' }
//   var isTweet = _.conformsTo(tweet, {
//     id_str: _.isString,
//     text: _.isString
//   })

//   if (isTweet) {
//     bookmarkTweet(tweet)
//   } else {
//     console.log('Some other event than a tweet occured:')
//   }
// }

var client = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.ACCESS_TOKEN_KEY,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET
})

console.log('Connecting to the Twitter stream')

connectToStream('statuses/filter', { track: '@save_this' })

function connectToStream (endpoint, parameters) {
  client.stream(endpoint, parameters, function (stream) {
    stream.on('data', function (event) {
      var isTweet = _.conformsTo(event, {
        id_str: _.isString,
        text: _.isString
      })

      if (isTweet) {
        bookmarkTweet(event)
      } else {
        console.log('Some other event than a tweet occured:')
        console.log(event)
      }
    })

    stream.on('error', function (error) {
      if (error.message === 'Status Code: 420') {
        console.log('Rate limit reached, waiting 10s to retry')
        setTimeout(() => {
          console.log('Reconnecting to the stream')
          connectToStream('statuses/filter', { track: '@save_this' })
        }, 10000)
      } else if (error.message === 'Unexpected token E in JSON at position 0' && error.source === 'Exceeded connection limit for user') {
        console.log(error.source)
      } else {
        debugger
        throw error
      }
    })
  })
}

async function bookmarkTweet (tweet) {
  console.log('Connecting to the database')

  try {
    await db.connect()
  } catch (error) {
    console.log('There was a problem with the database connection.')
    throw error
  }

  if (tweet.in_reply_to_status_id_str) {
    try {
      var tweetToBookmark = await client.get('statuses/show', { id: tweet.in_reply_to_status_id_str }) // todo: what if tweet deleted?
    } catch (error) {
      throw error
    }

    try {
      await db.update(User, {
        filter: { id_str: tweet.user.id_str, 'bookmarks.id_str': { $ne: tweet.in_reply_to_status_id_str } },
        // filter: { id_str: tweet.user.id_str },
        data: { twitterUserData: tweet.user },
        push: {
          bookmarks: {
            id_str: tweet.in_reply_to_status_id_str,
            tweet: tweetToBookmark,
            bookmarkedTime: new Date()
          }
        }
      })
    } catch (e) {
      if (e.code === 11000) {
        var alreadyBookmarked = true
      } else {
        throw e
      }
    }
    if (alreadyBookmarked) {
      console.log(`Tweet ID ${tweet.in_reply_to_status_id_str} was already bookmarked`) // this shouldn't even happen as Twitter prevents the same tweet/reply to be sent twice
    } else {
      console.log(`Tweet ID ${tweet.in_reply_to_status_id_str} bookmarked`)
    }
  } else {
    console.log('The tweet containing the mention is not a reply')
  }

  try {
    await db.disconnect()
  } catch (error) {
    console.log('Error while disconnecting from the database.')
    throw error
  }

  console.log('Disconnected from the database.')
}
