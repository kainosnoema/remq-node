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
    stream = require('../../lib/remq').createWriteStream(channel, { db: 2 });
    stream.client.flushAll(done);
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