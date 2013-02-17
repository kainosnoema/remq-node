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
 * @param {String} pattern
 * @param {Object} options
 * @api public
 */

function ReadableStream(client){
  Stream.call(this);

  this.readable = true;

  var self = this;
  client.on('message', function(channel, message) {
    self.emit('data', message.body, message);
  });
  client.on('error', function(err) { self.emit('error', err); });
  client.on('end', function() { self.emit('end'); });
}


/*
 * Inherit from Stream
 */

util.inherits(ReadableStream, Stream);