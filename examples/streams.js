var fs = require('fs')
  , remq = require('../lib/remq');

// create a readable stream and transform messages before emitting data events
var events = remq.createReadStream('events.*', {
  map: function(msg) { return '[' + msg.channel + '] ' + msg.body + '\n'; }
});

// send events to stdout, then write them to a log file
events.pipe(process.stdout);
events.pipe(fs.createWriteStream('events-all.log', { flags: 'a' }));

// pipe events from `events.foo` to `events.bar` (could be on another server)
remq.createReadStream('events.foo').pipe(remq.createWriteStream('events.bar'));

// write to `events.foo` every second
var writeStream = remq.createWriteStream('events.foo');
setInterval(function() {
  writeStream.write(new Date());
}, 1000);