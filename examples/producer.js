var remq = require('../lib/remq').createClient();

// setInterval(queueMessages.bind(null, 1), 100);

setInterval(queueMessages.bind(null, 20), 0);

function queueMessages(n) {
  for(var i = 0; i < n; i++) {
    var message = buildMessage()
      , channel = 'events.' + message.type.toLowerCase();
    remq.publish(channel, message, handleResponse);
  }

  function handleResponse(err, id) {
    if(err) { return console.error(err); }
    // console.log("Published '" + channel + "." + id +"'");
  }
}

var events = ['create', 'update', 'delete']
  , types = ['Account', 'Subscription', 'Transaction']
  , id = 0;
function buildMessage() {
  var event = events[Math.floor(Math.random() * events.length)];
  var type = types[Math.floor(Math.random() * types.length)];
  return { event: event, type: type, attributes: {
      account_id: id++
    , first_name: 'Evan'
    , last_name: 'Owen'
    , state: 'active'
    }
  };
}