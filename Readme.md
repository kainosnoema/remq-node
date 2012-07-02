# Remq-node

A [Node.js](http://nodejs.org) client library for [Remq](https://github.com/kainosnoema/remq), a [Redis](http://redis.io)-based protocol for building fast, persistent pub/sub message queues.

NOTE: In early-stage development, API not locked.

## Installation

``` sh
npm install remq
```

## Usage

**Producer:**

``` js
var remq = require('remq').createClient();

var message = { event: 'signup', account_id: 694 };

remq.publish('events.accounts', message, function(err, id) {
  if(err) { return console.error(err); }
  console.log("Published message to the 'events.accounts' channel with id: " + id);
});
```

**Pub/sub consumer (messages lost during failure):**

``` js
var remq = require('remq').createClient();

remq.on('message', function(channel, message, id) {
  console.log("Received message on the 'events.accounts' channel with id: " + id);
  console.log("Account just signed up: " + message.account_id);
});

remq.subscribe('events.accounts');
```

**Polling consumer with cursor (resumes post-failure):**

``` js
var remq = require('remq').createClient()
  , cursorKey = remq.key('cursor:consumer-1');

remq.on('message', function(channel, message, id) {
  console.log("'" + channel + '.' + id + "':");
  console.log(require('util').inspect(message) + '\n');
  count++;
});

// retrieve cursor and resume subscription at the cursor
remq.redis.get(cursorKey, function(err, cursor) {
  remq.subscribe('events.accounts', { cursor: cursor, interval: 1000 });
});

// update cursor using the `cursor` event (emitted after poll)
remq.on('cursor', function(cursor) { remq.redis.set(cursorKey, cursor); });
```

**Purging old messages:**

``` js

// purge old messages, keeping the last 1 million
remq.purge('events.accounts', { keep: 10000000 }, function(err, num) {
  if(err) { return console.error(err); }
  console.log("purged " + num + " messages from 'events.accounts'");
});

```