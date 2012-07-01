var redis = require('redis').createClient();

redis.on('pmessage', function(pattern, channel, id) {
  console.log("'" + channel + '.' + id + "'");
});

redis.psubscribe('remq:stats:events.*');
