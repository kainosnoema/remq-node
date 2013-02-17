require('should');

describe('Remq', function(){
  this.timeout(100); // no test should take very long

  var remq
    , channel = 'foo.1'
    , body = 'hello world'
    , withHeader = channel + '@1\n' + body;

  function subscribe(done) { remq.subscribe(channel, {}, done); }
  function publish(done) { remq.publish(channel, body, done); }
  function publishN(n, done) {
    if(n > 0) { publish(publishN.bind(this, n - 1, done)); }
    if(done) done();
  }
  function expectOrdered(msgs, done) {
    msgs.forEach(function(msg, i) { msg.should.include({ id: i + 1 }); });
    if(done) done();
  }

  beforeEach(function(done) {
    if(remq) { remq.end(); }
    remq = require('../lib/remq').createClient({ db: 2 });
    remq.flushAll(done);
  });

  describe('#publish()', function(){
    it('publishes a message on the channel indicated', function(done){
      remq.redisPubSub.psubscribe('remq:channel:' + channel, publish);
      remq.redisPubSub.on('pmessage', function(pattern, channel, msg) {
        remq.redisPubSub.punsubscribe(channel, done);
        msg.should.equal(withHeader);
      });
    });

    it('persists the message to an archive key', function(done) {
      publish();
      remq.redis.zrange('remq:archive:0', 0, -1, function(err, msgs) {
        msgs.pop().should.equal(withHeader);
        done(err);
      });
    });
  });

  describe('#subscribe()', function(){
    it('subscribes using Redis pub/sub', function(done){
      remq.on('message', function(channel, msg) {
        msg.channel.should.equal(channel);
        msg.body.should.equal(body);
        done();
      });
      subscribe();
      publish();
    });

    context('with fromId', function() {
      function subscribe(done) { remq.subscribe(channel, { fromId: 0 }, done); }

      it('replays any missed messages', function(done) {
        var msgs = [];
        remq.on('message', function(channel, msg) {
          msgs.push(msg);
          if(msgs.length == 10) {
            expectOrdered(msgs, done);
          }
        });

        publishN(10, subscribe);
      });

      it('doesn\'t miss or repeat when switching to pub/sub', function(done) {
        var msgs = [];
        remq.on('message', function(channel, msg) {
          msgs.push(msg);
          if(msgs.length == 200) {
            expectOrdered(msgs, done);
          }
        });

        publishN(100, function() { subscribe(publishN.bind(this, 100)); });
      });
    });
  });

});