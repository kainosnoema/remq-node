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
 * @param {String} pattern
 * @param {Object} options
 * @api public
 */

function WritableStream(channel, client){
  Stream.call(this);

  this.writable = true;
  this.channel = channel;
  this.client = client;

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
  this.client.publish(this.channel, data.toString());
};

/*
 * End stream
 */

WritableStream.prototype.end = function() {
  this.client.end();
};