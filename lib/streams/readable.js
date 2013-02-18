/**
 * Module dependencies.
 */

var util = require('util')
  , Stream = require('stream');

/**
 * Expose `ReadableStream`.
 */

module.exports = ReadableStream;


/**
 * Wrap a Remq client in a Readable Stream that emits messages as `data` events.
 *
 * Options:
 *
 *   - `map` a transform function to turn messages into data packets
 *
 * @param {String} client
 * @param {Object} options
 * @api public
 */

function ReadableStream(client, options){
  Stream.call(this);

  if(!options) { options = {}; }

  this.readable = true;
  this.client = client;

  this.map = options.map || function(message) { return message.body; };

  var self = this;
  client.on('message', function(pattern, message) {
    self.emit('data', self.map(message).toString(), message);
  });
  client.on('error', function(err) { self.emit('error', err); });
  client.on('end', function() { self.emit('end'); });
}


/*
 * Inherit from Stream
 */

util.inherits(ReadableStream, Stream);