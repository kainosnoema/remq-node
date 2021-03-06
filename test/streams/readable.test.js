require('should');

describe('Remq.ReadableStream', function(){
  this.timeout(500);

  var stream
    , channel = 'foo.1'
    , body = 'hello world'
    , withHeader = channel + '@1\n' + body;

  function publish(done) { stream.client.publish(channel, body, done); }

  beforeEach(function(done) {
    stream = require('../../lib/remq').createReadStream(channel, { db: 2 });
    stream.client.flushAll(done);
  });

  afterEach(function() { stream.client.end(); });

  describe('`data` event', function(){
    it('calls listener with raw data and parsed message', function(done){
      stream.on('data', function(data, message){
        data.should.equal(body);
        message.should.include({ body: body });
        done();
      });
      publish();
    });

    context('with `map` function', function() {
      beforeEach(function(done) {
        var options = { db: 2, map: function(msg) {
          return msg.id + ' ' + msg.body;
        }};

        stream = require('../../lib/remq').createReadStream(channel, options);
        stream.client.flushAll(done);
      });

      it('is called on messages before emitting `data` event', function(done) {
        stream.on('data', function(data, message) {
          data.should.equal(message.id + ' ' + body);
          done();
        });
        publish();
      });
    });
  });

});