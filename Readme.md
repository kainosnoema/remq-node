# remq-node [![Build Status][travis-image]][travis-link]

[travis-image]: https://secure.travis-ci.org/kainosnoema/remq-node.png?branch=master
[travis-link]: http://travis-ci.org/kainosnoema/remq-node

A [Node.js](http://nodejs.org) client library for
[Remq](https://github.com/kainosnoema/remq), a [Redis](http://redis.io)-based
protocol for building fast, durable message queues.

**WARNING**: In early-stage development, API not stable. If you've used a
previous version, you'll most likely have to clear all previously published
messages in order to upgrade to the latest version.

## Installation

``` sh
npm install remq
```

## Usage

**Producer:**

``` js
var remq = require('remq').createClient();

var message = JSON.stringify({ event: 'signup', account_id: 694 });

remq.publish('events.accounts', message, function(err, id) {
  if(err) { return console.error(err); }
});
```

**Consumer:**

``` js
var remq = require('remq').createClient()
  , lastIdKey = remq.key('cursor', 'consumer-1')
  , lastId = 1;

remq.on('message', function(channel, message) {
  lastId = message.id;

  message.body = JSON.parse(message.body);

  console.log("Received message on '" + channel + "' with id: " + message.id);
  console.log("Account signed up with id: " + message.body.account_id);
});

remq.redis.get(lastIdKey, function(err, id) {
  lastId = id;
  remq.subscribe('events.*', { fromId: lastId || 1 });
});

// by persisting the lastId every second, a maximum of 1 second of
// messages will be replayed in the case of consumer failure
setInterval(function() { remq.redis.set(lastIdKey, lastId); }, 1000);
```

**Flush:**

``` js

// flush old messages from before message with id=10000000
remq.flush('events.*', { before: 10000000 }, function(err, num) {
  if(err) { return console.error(err); }
  console.log("flushed " + num + " messages from 'events.*'");
});

```

## License

(The MIT License)

Copyright © 2013 Evan Owen &lt;kainosnoema@gmail.com&gt;

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.