require('should');

describe('Remq.WritableStream', function(){
  this.timeout(100);

  var stream
    , channel = 'foo.1'
    , body = 'hello world'
    , withHeader = channel + '@1\n' + body;

  function subscribe(done) { stream.client.subscribe(channel, {}, done); }

  beforeEach(function(done) {
    if(stream) { stream.end(); }

    // reconnect to test db
    stream = require('../../lib/remq').createWriteStream(channel);
    stream.client.redis.select(2, function() {

      // clear out any existing remq keys
      stream.client.redis.keys('remq:*', function(err, keys) {
        if(!keys.length) return done();
        stream.client.redis.del(keys, done);
      });
    });
  });

  describe('#write()', function(){
    it('publishes data as a message to channel', function(done){
      stream.client.on('message', function(channel, message){
        message.should.include({ body: body });
        done();
      });
      subscribe();
      stream.write(body);
    });
  });

});