var cluster = require('cluster')
  , remq = require('../lib/remq').createClient()
  , Message = require('./shared/message');

if (cluster.isMaster) {

  // Consumer

  var hrtime = process.hrtime()
    , count = 0
    , cursor = -1;

  remq.on('message', function(pattern, message) {
    cursor = message.id;
    count += 1;

    if(count >= 1000) {
      var diff = process.hrtime(hrtime)
        , speed = Math.round(count / (diff[0] + (diff[1] / 1e9)));
      console.log('\033[0;0f\033[Kreceiving at ' + speed + ' messages/sec, cursor: ' + cursor);
      hrtime = process.hrtime();
      count = 0;
    }
  });

  remq.subscribe('events.*');

  // start the producer

  cluster.fork();

} else if (cluster.isWorker) {

  // Producer

  function publish(message) {
    var channel = 'events.' + message.type.toLowerCase() + '.' + message.event;
    remq.publish(channel, 'Hello');
  }

  function publishMessages(n) {
    for(var i = 0; i < n; i++) {
      publish(new Message());
    }
  }

  setInterval(publishMessages.bind(null, 50), 0);
}