process.env.DEBUG = 'remq:*';

var remq = require('../lib/remq').createClient()
  , Message = require('./shared/message');

function publishMessages(n) {
  for(var i = 0; i < n; i++) {
    publish(new Message());
  }

  function publish(message) {
    var channel = 'events.' + message.type.toLowerCase() + '.' + message.event;

    remq.publish(channel, JSON.stringify(message), function(err, id) {
      if(err) { return console.error(err); }
    });
  }
}

setInterval(publishMessages.bind(null, 1), 150);
