var remq = require('../lib/remq').createClient()
  , util = require('util')
  , cursorKey = remq.key('cursor:consumer-1');

var count = 0, cursor = 0;

remq.on('message', function(channel, message, id) {
  console.log("'" + channel + "':");
  console.log(require('util').inspect(message) + '\n');
  count++;
});

remq.redis.get(cursorKey, function(err, id) {
  cursor = id;
  remq.subscribe('events.*', { cursor: cursor, limit: 2000, interval: 100 });
});

remq.on('cursor', function(id) {
  cursor = id;
  remq.redis.set(cursorKey, cursor);
});

setInterval(function() {
  remq.purge('events.*', { keep: 100000 }, function(err, num) {
    if(err) { return console.error(err); }
    if(num > 0) {
      console.log('\033[0;0f\033[Kpurged ' + num + ' messages from \'events.*\', keeping ' + 100000);
    }
  });
}, 10000);

// setInterval(function() {
//   console.log('\033[0;0f\033[Kreceiving at ' + (count * 2) + ' messages/sec, cursor: ' + cursor);
//   count = 0;
// }, 500);
