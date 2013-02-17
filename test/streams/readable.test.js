require('should');

describe('Remq.ReadableStream', function(){
  this.timeout(100);

  var stream
    , channel = 'foo.1'
    , body = 'hello world'
    , withHeader = channel + '@1\n' + body;

  function publish(done) { stream.client.publish(channel, body, done); }

  beforeEach(function(done) {
    if(stream) { stream.end(); }

    // reconnect to test db
    stream = require('../../lib/remq').createReadStream(channel);
    stream.client.redis.select(2, function() {

      // clear out any existing remq keys
      stream.client.redis.keys('remq:*', function(err, keys) {
        if(!keys.length) return done();
        stream.client.redis.del(keys, done);
      });
    });
  });

  describe('`data` event', function(){
    it('calls listener with raw data and parsed message', function(done){
      stream.on('data', function(data, message){
        data.should.equal(body);
        message.should.include({ body: body });
        done();
      });
      publish();
    });
  });

});