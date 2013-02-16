var events = ['create', 'update', 'delete']
  , types = ['Account', 'Subscription', 'Transaction']
  , id = 0;

module.exports = function() {
  this.event = events[Math.floor(Math.random() * events.length)];
  this.type = types[Math.floor(Math.random() * types.length)];
  this.attributes = {
    account_id: id++
  , first_name: 'Evan'
  , last_name: 'Owen'
  , state: 'active'
  };
};
