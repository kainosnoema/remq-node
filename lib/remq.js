/**
 * Module dependencies.
 */

var fs = require('fs')
  , path = require('path')
  , redis = require('redis')
  , crypto = require('crypto')
  , EventEmitter = require('events').EventEmitter;


/**
 * Load Redis Lua scripts.
 */

var publishScript = fs.readFileSync(path.join(__dirname, '../vendor/remq/scripts/publish.lua'))
  , consumeScript = fs.readFileSync(path.join(__dirname, '../vendor/remq/scripts/consume.lua'))
  , purgeScript =   fs.readFileSync(path.join(__dirname, '../vendor/remq/scripts/purge.lua'));


/**
 * Expose `Remq`.
 */

module.exports = Remq;


/**
 * Initialize `Remq` with the given `options`.
 *
 * Options:
 *
 *   - `redis` The redis client for Remq
 *
 * @param {Object} options
 * @api public
 */

function Remq(options) {
  options = (options || {});

  this.redis = options.redis || redis.createClient(options.port, options.host, options);
  this.coder = options.coder || {
    encode: JSON.stringify
  , decode: JSON.parse
  }

  this.namespace = ['remq', options.namespace].filter(Boolean).join(':');
  this.channelRegexp = new RegExp('^' + this.namespace + ':channel:');
  this.subscriptions = {};

  var self = this;
  this.redis.on('pmessage', function(pattern, channel, message) {
    if(!pattern.match(self.channelRegexp)) { return; }
    self.emit('message', channel.replace(self.channelRegexp, ''), self.coder.decode(message));
  });
}


/**
 * Create a `Remq` client with the given `options` (see constructor).
 *
 * @param {Object} options
 * @api public
 */

Remq.createClient = function(options) {
  return new Remq(options);
}


/*
 * Inherit from EventEmitter
 */

Remq.prototype.__proto__ = EventEmitter.prototype;


/**
 * Publish a `message` to the given `channel`. The `message` can be a simple string,
 * but objects will be automatically serialized and deserialized. The callback
 * will be called with the id of the message if publishing succeeds.
 *
 * @param {String} channel
 * @param {Object|String} msg
 * @param {Function} callback
 * @api public
 */

Remq.prototype.publish = function(channel, msg, cb) {
  _evalScript.call(this, publishScript, 0, this.namespace, channel, this.coder.encode(msg), cb);
}


/**
 * Subscribe to the given `channel`. If no initial `cursor` is provided, Remq subscribes
 * using vanilla Redis pub/sub. Any Redis psubscribe pattern will work. If `cursor` is
 * provided, Remq polls on regular intervals and keeps track of the cursor until
 * unsubscribed. Messages are emitted using the `message` event.
 *
 * Options:
 *
 *   - `cursor`    The exact message id to start with (uses polling instead of pub/sub)
 *                 For post-failure recovery, you'll want to persist the last cursor
 *                 received or processed.
 *
 *   Only if using `cursor` (polling):
 *
 *   - `interval`  The frequency of polling, given in milleseconds
 *   - `limit`     The maximum number of messages to return during each poll
 *
 * @param {String} channel
 * @param {Object} options
 * @api public
 */

Remq.prototype.subscribe = function(channel, options) {
  options = (options || {});

  this.subscriptions[channel] = true;

  // if we're not trying to resume the stream, we can use vanilla Redis pub/sub
  if(typeof(options.cursor) == 'undefined') {
    this.redis.psubscribe(this.key('channel:' + channel));
    return;
  }

  var timeout = options.interval || 1000
    , consumer = typeof(options.consumer) == 'string' ? options.consumer : null
    , cursor = parseInt(options.cursor, 0) || null
    , self = this;

  (function poll(cursor) {
    options.cursor = cursor;
    self.consume(channel, options, function(err, results) {
      if(!self.subscriptions[channel]) { return; }
      if(err) { return self.emit('error', err); }

      results.forEach(function(event) {
        self.emit('message', channel, event.message, event.id);
      });

      if(results.length > 0) {
        // update the cursor
        cursor = results[results.length - 1].id;
        self.emit('cursor', cursor);
      }

      setTimeout(poll.bind(self, cursor), timeout);
    });
  })(cursor);
}


/**
 * Unsubscribe from the given `channel`. No more `message` events will
 * be emitted after this is called.
 *
 * @param {String} channel
 * @api public
 */

Remq.prototype.unsubscribe = function(channel) {
  delete this.subscriptions[channel];
  this.redis.punsubscribe(this.key('channel:' + channel));
}

/**
 * Consume persisted messages from the given `channel`, starting with the `cursor`
 * if provided, or the first message. `limit` determines how many messages will be
 * return each time `consume` is called.
 *
 * Options:
 *
 *   - `cursor` The id of the first message to return.
 *   - `limit`  The maximum number of messages to return during this call.
 *              (to retrieve more, call `consume` multiple times)
 *
 * @param {String} channel
 * @param {Object} options
 * @param {Function} callback
 * @api private
 */


Remq.prototype.consume = function(channel, options, cb) {
  if(!cb) { cb = options; options = {}; }

  var cursor = parseInt(options.cursor, 0) || 0
    , limit = parseInt(options.limit, 0) || 4000
    , self = this;

  _evalScript.call(this, consumeScript, 0, this.namespace, channel, cursor, limit, function(err, results) {
    if(err) { return cb(err); }
    var msgs = [];
    for(var i = 0; i < results.length; i++) {
      if(i % 2 === 0) {
        msgs.push({ id: results[i+1], message: self.coder.decode(results[i]) });
      }
    }
    cb(null, msgs);
  });
}


/**
 * Purge old persisted messages.
 *
 * Options:
 *
 *   - `before`  Remove all messages prior to this id
 *            or
 *   - `keep`    The number of messages to keep
 *
 * @param {String} channel
 * @param {Object} options
 * @param {Function} callback
 * @api public
 */

Remq.prototype.purge = function(channel, options, cb) {
  if(!cb) { cb = options; options = {}; }

  var before = parseInt(options.before, 0) || null
    , keep = parseInt(options.keep, 0) || null
    , self = this;

  if(before && (before <= 0)) { return cb(null, 0); }

  var command = before ? 'BEFORE' : 'KEEP'
    , value = before || keep;
  _evalScript.call(this, purgeScript, 0, this.namespace, channel, command, value, function (err, removed) {
    if(err) { return cb(err); }
    cb(null, removed);
  });
}

/**
 * Build a key from the given `name` using the current namespace.
 *
 * @param {String} name
 * @api public
 */

Remq.prototype.key = function(name) {
  return this.namespace + ':' + name;
}


/**
 * Execute a Redis Lua `script` by trying `evalsha` first, falling
 * back to `eval` if the script hasn't been cached yet.
 *
 * @param {String} script
 * @param args...
 * @param {Function} callback
 * @api private
 */

function _evalScript() { /* script ... args, callback */
  var args = [].slice.call(arguments)
    , script = args.shift()
    , cb = args.pop()
    , self = this;

  var sha = crypto.createHash('sha1').update(script).digest('hex');
  this.redis['evalsha'].apply(this.redis, [sha].concat(args).concat([function(err, result) {
    if(err) {
      if(err.toString().match(/NOSCRIPT/)) {
        self.redis['eval'].apply(self.redis, [script].concat(args).concat([function(err, result) {
          if(cb) { cb(err, result); }
        }]));
      } else {
        if(cb) { cb(err); }
      }
    } else {
      if(cb)  { cb(null, result); }
    }
  }]));
}
