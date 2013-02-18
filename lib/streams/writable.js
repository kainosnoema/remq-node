/**
 * Module dependencies.
 */

var util = require('util')
  , Stream = require('stream');

/**
 * Expose `WritableStream`.
 */

module.exports = WritableStream;


/**
 * Wrap a Remq client in a Writable Stream that emits messages as `data` events.
 *
 * Options:
 *
 *   - `map` a transform function to turn data packets into messages
 *
 * @param {String} channel
 * @param {String} client
 * @param {Object} options
 * @api public
 */

function WritableStream(channel, client, options){
  Stream.call(this);

  if(!options) { options = {}; }

  this.writable = true;
  this.channel = channel;
  this.client = client;

  this.map = options.map || function(data) { return data; };

  var self = this;
  client.on('error', function(err) { self.emit('error'); });
}


/*
 * Inherit from Stream
 */

util.inherits(WritableStream, Stream);

/*
 * Write to stream
 */

WritableStream.prototype.write = function(data) {
  this.client.publish(this.channel, this.map(data).toString());
};

/*
 * End stream
 */

WritableStream.prototype.end = function() {
  this.client.end();
};