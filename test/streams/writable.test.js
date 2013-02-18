require('should');

describe('Remq.WritableStream', function(){
  this.timeout(500);

  var stream
    , channel = 'foo.1'
    , body = 'hello world'
    , withHeader = channel + '@1\n' + body;

  function subscribe(done) { stream.client.subscribe(channel, {}, done); }

  beforeEach(function(done) {
    stream = require('../../lib/remq').createWriteStream(channel, { db: 2 });
    stream.client.flushAll(done);
  });

  afterEach(function() { stream.client.end(); });

  describe('#write()', function(){
    it('publishes data as a message to channel', function(done){
      stream.client.on('message', function(channel, message){
        message.should.include({ body: body });
        done();
      });
      subscribe();
      stream.write(body);
    });

    context('with `map` function', function() {
      beforeEach(function(done) {
        var options = { db: 2, map: function(data) {
          return JSON.parse(data)['data'];
        }};

        stream = require('../../lib/remq').createWriteStream(channel, options);
        stream.client.flushAll(done);
      });

      it('is called on messages before emitting `data` event', function(done) {
        stream.client.on('message', function(channel, message){
          message.should.include({ body: body });
          done();
        });
        subscribe();
        stream.write(JSON.stringify({ data: body }));
      });
    });
  });

});