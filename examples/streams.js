var remq = require('../lib/remq');

// read all `events.*`

var readStream = remq.createReadStream('events.*');
readStream.on('data', function(data, message) {
  console.log(message.channel + ': ' + data);
});

// pipe `events.foo` to `events.bar`

remq.createReadStream('events.foo').pipe(remq.createWriteStream('events.bar'));

// write to `events.foo`

var writeStream = remq.createWriteStream('events.foo');
setInterval(function() { writeStream.write(new Date()); }, 1000);