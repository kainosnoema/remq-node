/**
 * Module dependencies.
 */

var fs = require('fs')
  , util = require('util')
  , path = require('path')
  , redis = require('redis')
  , crypto = require('crypto')
  , EventEmitter = require('events').EventEmitter;


/**
 * Load Redis Lua scripts.
 */

var publishScript = fs.readFileSync(path.join(__dirname, '../vendor/remq/scripts/publish.lua'))
  , consumeScript = fs.readFileSync(path.join(__dirname, '../vendor/remq/scripts/consume.lua'))
  , flushScript =   fs.readFileSync(path.join(__dirname, '../vendor/remq/scripts/flush.lua'));


/**
 * Expose `Remq`.
 */

module.exports = Remq;

/**
 * Expose Streams
 */

module.exports.ReadableStream = require('./streams/readable');
module.exports.WritableStream = require('./streams/writable');

/**
 * Initialize `Remq` with the given `options`, which are passed to redis.
 *
 * Options:
 *
 *   - `redis` The redis client for Remq
 *
 * @param {Object} options
 * @api public
 */

function Remq(options) {
  EventEmitter.call(this);

  options = (options || {});

  this.buffer = [];
  this.cursors = {};
  this.limit = Math.min(options.limit || 1000, 1000);
  this.patternRegexp = new RegExp('^' + this.pattern());
  this.subscriptions = {};

  this.redis = redis.createClient(options.port, options.host, options);
  this.redisPubSub = redis.createClient(options.port, options.host, options);

  if(options.db) {
    this.redis.select(options.db);
    this.redisPubSub.select(options.db);
  }

  this.redisPubSub.on('pmessage', this._onPubSubMessage.bind(this));

  this._bufferPubSub = false;
}


/*
 * Inherit from EventEmitter
 */

util.inherits(Remq, EventEmitter);


/**
 * Create a `Remq` client with the given `options` (see constructor).
 *
 * @param {Object} options
 * @api public
 */

Remq.createClient = function(options) {
  return new Remq(options);
};


/**
 * Create a Readable Stream that subscribes to given `pattern` and emits `data`
 * events as messages are recieved.
 *
 * @param {String} pattern
 * @param {Object} options
 * @api public
 */

Remq.createReadStream = function(pattern, options) {
  var client = this.createClient(options);
  setTimeout(function() { client.subscribe(pattern, options); });
  return new Remq.ReadableStream(client);
};


/**
 * Create a Readable Stream that subscribes to given `pattern` and emits `data`
 * events as messages are recieved.
 *
 * @param {String} pattern
 * @param {Object} options
 * @api public
 */

Remq.createWriteStream = function(channel, options) {
  return new Remq.WritableStream(channel, this.createClient(options));
};


/**
 * Publish a `message` to the given `channel`. The `message` must be a string,
 * but objects can easily be serialized using JSON, etc. The callback will be
 * called with the id of the message if publishing succeeds.
 *
 * @param {String} channel
 * @param {String} message
 * @param {Function} callback
 * @api public
 */

Remq.prototype.publish = function(channel, message, callback) {
  _evalScript.call(this, publishScript, 0, channel, message, callback);
};


/**
 * Subscribe to the channels matching the given `pattern`. If no initial
 * `fromId` is provided, Remq subscribes using vanilla Redis pub/sub. Any Redis
 * pub/sub pattern will work. If `fromId` is provided, Remq replays messages
 * after the given id until its caught up and able to switch to pub/sub.
 *
 * Options:
 *
 *   - `fromId` The message id to replay after (usually the last received)
 *
 * @param {String} pattern
 * @param {Object} options
 * @param {Function} callback
 * @api public
 */

Remq.prototype.subscribe = function(pattern, options, callback) {
  if(this.subscriptions[pattern]) return;
  this.subscriptions[pattern] = true;

  if(!options) { options = {}; }

  var cursor = parseInt(options.fromId, 10)
    , self = this;

  if(cursor === 0) { cursor = -1; }
  if(!cursor) { cursor = this.cursors[pattern]; }

  if(cursor || cursor === 0) {
    // if we're resuming, we need to try to catch up from cursor
    this._subscribeFromCursor(pattern, cursor, function(err) {
      if(err) { return self._onError(err, callback); }
      if(callback) callback();
    });
  } else {
    // otherwise we can subscribe immediately
    this._subscribeToPubSub(pattern, { caughtUp: true }, function(err) {
      if(err) { return self._onError(err, callback); }
      if(callback) callback();
    });
  }
};


/**
 * Unsubscribe from the given `pattern`. No more `message` events will
 * be emitted after this is called.
 *
 * @param {String} pattern
 * @param {Function} callback
 * @api public
 */

Remq.prototype.unsubscribe = function(pattern, callback) {
  delete this.subscriptions[pattern];
  this._unsubscribeFromPubSub(pattern, callback);
};


/**
 * Consume persisted messages from channels matching the given `pattern`,
 * starting with the `cursor` if provided, or the first message. `limit`
 * determines how many messages will be return each time `consume` is called.
 *
 * Options:
 *
 *   - `cursor` The id of the first message to return.
 *   - `limit`  The maximum number of messages to return during this call.
 *              (to retrieve more, call `consume` multiple times)
 *
 * @param {String} pattern
 * @param {Object} options
 * @param {Function} callback
 * @api public
 */

Remq.prototype.consume = function(pattern, options, callback) {
  if(!callback) { callback = options, options = {}; }

  var cursor = parseFloat(options.cursor) || this.cursors[pattern] || 0
    , limit = parseInt(options.limit, 10) || this.limit
    , self = this;

  _evalScript.call(this, consumeScript, 0, pattern, cursor, limit, function(err, messages) {
    if(err) { return self._onError(err, callback); }
    messages = messages.map(self._onMessage.bind(self, self.pattern(pattern))).filter(Boolean);
    if(callback) { callback(null, messages); }
  });
};


/**
 * Purge old persisted messages.
 *
 * Options:
 *
 *   - `before`  Remove all messages prior to this id
 *            or
 *   - `keep`    The number of messages to keep
 *
 * @param {String} pattern
 * @param {Object} options
 * @param {Function} callback
 * @api public
 */

Remq.prototype.flush = function(pattern, options, callback) {
  if(!callback) { callback = options, options = {}; }

  var before = parseInt(options.before, 10) || null
    , self = this;

  if(before && (before <= 1)) { return callback(null, 0); }

  _evalScript.call(this, flushScript, 0, pattern, before, function (err, removed) {
    if(err) { return self._onError(err, callback); }
    if(callback) { callback(null, removed); }
  });
};


/**
 * Forcibly close the connections to the Redis server.
 *
 * @api public
 */

Remq.prototype.end = function() {
  this.redis.end();
  this.redisPubSub.end();
  this.emit('end');
};


/**
 * Build a key from the given `name` and `channel`.
 *
 * @param {String} name
 * @param {String} channel
 * @api public
 */

Remq.prototype.key = function(/* name, parts... */) {
  var parts = [].slice.call(arguments);
  parts.unshift('remq');
  return parts.join(':');
};


/**
 * Build a pattern from the given `channel`.
 *
 * @param {String} channel
 * @api public
 */

Remq.prototype.pattern = function(channel) {
  return this.key('channel', channel);
};


/**
 * Subscribe from cursor position, eventually switching to pub/sub.
 *
 * @param {String} pattern
 * @param {Number} cursor
 * @param {Function} callback
 * @api private
 */

Remq.prototype._subscribeFromCursor = function(pattern, cursor, callback) {
  var self = this;
  (function consumeChannelFrom(cursor) {
    var opts = { cursor: cursor, limit: self.limit };
    self.consume(pattern, opts, function(err, results) {
      if(err) { return self._onError(err, callback); }

      if(!self.subscriptions[pattern]) { return; } // must have unsubscribed

      var opts = { useBuffer: true, caughtUp: results.length < self.limit };
      self._subscribeToPubSub(pattern, opts, function(err, subscribed) {
        if(err) { return self._onError(err, callback); }
        if(subscribed) {
          if(callback) { callback(); }
        } else {
          if(results.length > 0) {
            cursor = results[results.length - 1].id;
          }
          consumeChannelFrom(cursor);
        }
      });
    });
  })(cursor);
};


/**
 * Subscribe while trying to catch up with pub/sub channels matching pattern.
 *
 * Options:
 *
 *   - `useBuffer` Buffer pub/sub messages while catching up with cursor.
 *   - `caughtUp`  Already caught up to pub/sub, stop buffering and switch over
 *
 * @param {String} pattern
 * @param {Object} options
 * @param {Function} callback
 * @api private
 */

Remq.prototype._subscribeToPubSub = function(pattern, options, callback) {
  var useBuffer = options.useBuffer || false
    , caughtUp  = options.caughtUp || true
    , self = this;

  if(this._bufferPubSub && caughtUp) {
    this.buffer.map(this._onMessage.apply.bind(this._onMessage, this));
    this._bufferPubSub = false;
    callback(null, true);

  } else if(this.bufferPubSub) {
    // can't buffer forever, will try again next time
    this._unsubscribeFromPubSub(pattern, function(err) {
      self.buffer = [];
      self.bufferPubSub = false;
      callback(err, false);
    });

  } else if(caughtUp) {
    if(useBuffer) { this._bufferPubSub = true; }

    this.redisPubSub.psubscribe(this.pattern(pattern), function(err) {
      callback(err, !useBuffer);
    });
  }
};


/**
 * Unsubscribe from pub/sub pattern.
 *
 * @param {String} pattern
 * @param {Function} callback
 * @api private
 */

Remq.prototype._unsubscribeFromPubSub = function(pattern, callback) {
  var self = this;

  this.redisPubSub.punsubscribe(this.pattern(pattern), function(err) {
    if(err) { self._onError(err, cb); }
    if(callback) { callback(); }
  });
};


/**
 * Handle receipt of a header-message pair from Redis pub/sub.
 *
 * @param {String} pattern
 * @param {String} channel
 * @param {String} pair
 * @api private
 */

Remq.prototype._onPubSubMessage = function(pattern, channel, message) {
  if(this._bufferPubSub) {
    this.buffer.push([pattern, message]);
  } else {
    this._onMessage(pattern, message);
  }
};


/**
 * Handle receipt of a header-message pair.
 *
 * @param {String} pattern
 * @param {String} pair
 * @api private
 */

Remq.prototype._onMessage = function(pattern, pair) {
  pattern = pattern.replace(this.patternRegexp, ''); // remove 'remq:channel:'

  if(!this.subscriptions[pattern]) { return false; }

  var message = _parseMessage(pair);

  if(this.cursors[pattern] >= message.id) { return false; }
  this.cursors[pattern] = message.id;

  this.emit('message', pattern.replace(this.patternRegexp, ''), message);

  return message;
};


/**
 * Handle receipt of an error.
 *
 * @param {Error} err
 * @param {Function} cb
 * @api private
 */

Remq.prototype._onError = function(err, cb) {
  if(cb) { cb(err); }
  else { this.emit('error', err); }
};


/**
 * Parse a message and header.
 *
 * @param {String} pair
 * @api private
 */

function _parseMessage(message) {
  var parts = message.split('\n')
    , headerParts = parts.shift().split(/@(?!.*@)/);

  return {
    id: parseInt(headerParts[1], 10)
  , channel: headerParts[0]
  , body: parts.join('\n')
  };
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
