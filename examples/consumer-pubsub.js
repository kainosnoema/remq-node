var remq = require('../lib/remq').createClient()
  , util = require('util');

remq.on('message', function(channel, message) {
  console.log("'" + channel + "':");
  console.log(require('util').inspect(message) + '\n');
});

remq.subscribe('events.*');
