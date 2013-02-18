process.env.DEBUG = 'remq:*';

var fs = require('fs')
  , remq = require('../lib/remq');

// create a readable stream and transform messages before emitting data events
var events = remq.createReadStream('events.*', {
  map: function(msg) { return '[' + msg.channel + '] ' + msg.body + '\n'; }
});

// write all events to a log file
events.pipe(fs.createWriteStream('events-all.log', { flags: 'a' }));

// pipe events from `events.foo` to `events.bar` (could be on another server)
remq.createReadStream('events.foo').pipe(remq.createWriteStream('events.bar'));

// publish to `events.foo` every second
var client = remq.createClient();
setInterval(function() {
  console.log();
  client.publish('events.foo', new Date());
}, 1000);