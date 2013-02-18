process.env.DEBUG = 'remq:*';

var remq = require('../lib/remq').createClient()
  , lastIdKey = remq.key('cursor', 'consumer-1')
  , lastId = -1;

remq.on('message', function(pattern, message) {
  lastId = message.id;
  console.log(message.body);
});

remq.redis.get(lastIdKey, function(err, id) {
  lastId = id || -1;
  remq.subscribe('events.*', { fromId: lastId });
});

// by persisting the lastId every second, a maximum of 1 second of
// messages will be replayed in the case of consumer failure
setInterval(function() { remq.redis.set(lastIdKey, lastId); }, 1000);