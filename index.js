
/**
 * Module dependencies.
 */

var ffi = require('ffi');
var debug = require('debug')('despotify');
var assert = require('assert');
var inherits = require('util').inherits;
var libdespotify = require('./libdespotify');
var Readable = require('stream').Readable;
var EventEmitter = require('events').EventEmitter;

// node v0.8.x compat
if (!Readable) Readable = require('readable-stream/readable');

/**
 * Initialization.
 */

assert(libdespotify.init());
process.on('exit', function () {
  assert(libdespotify.cleanup());
});

/**
 * Module exports.
 */

module.exports = Despotify;

/**
 * The `Despotify` class encapsulates a "spotify session".
 *
 * @api public
 */

function Despotify (highBitrate, useCache) {
  if (!(this instanceof Despotify)) return new Despotify(highBitrate, useCache);
  EventEmitter.call(this);

  if (null == highBitrate) highBitrate = false;
  if (null == useCache) useCache = false;

  // the callback C function pointer for the spotify session to use
  this.cb = ffi.Callback(
    'void',
    [ libdespotify.session_ptr,
      'int',
      libdespotify.signal_data,
      libdespotify.void_ptr
    ],
    callback(this)
  );

  // create the session instance
  // TODO: make async, emit "session" event...
  this.session = libdespotify.init_client(
    this.cb,     // callback pointer
    null,        // user data (we don't need any)
    highBitrate, // request high bitrate audio?
    useCache     // use cache?
  );
}
inherits(Despotify, EventEmitter);

/**
 * Logs in to the Spotify server with the given `un` username and `pw` password.
 * A "login" event will be emitted when successfully
 * logged in, otherwise an "error" event will be emitted upon error. You can also
 * pass a callback function to handle both cases.
 *
 * @param {String} un username
 * @param {String} pw password
 * @param {Function} fn callback function
 * @api public
 */

Despotify.prototype.login =
Despotify.prototype.authenticate = function (un, pw, fn) {
  var self = this;
  function onLogin () {
    cleanup();
    fn();
  }
  function onError (err) {
    cleanup();
    fn(err);
  }
  function cleanup () {
    self.removeListener('login', onLogin);
    self.removeListener('error', onError);
  }
  if ('function' == typeof fn) {
    this.on('login', onLogin);
    this.on('error', onError);
  }

  libdespotify.authenticate.async(this.session, un, pw, function (err, rtn) {
    if (err) return self.emit('error', err);
    if (!rtn) return self.emit('error', new Error('despotify_authenticate(): ' + rtn));
    self.emit('login');
  });
};

/**
 * Begins playing a Spotify song via a URI. This will probably change...
 *
 * @api public
 */

Despotify.prototype.play = function (uri, playAsList) {
  if (null == playAsList) playAsList = false;

  var link = libdespotify.link_from_uri(uri);
  var track = libdespotify.link_get_track(this.session, link);

  // begin playing
  var r = libdespotify.play(this.session, track, playAsList);
  if (!r) {
    this.emit('error', new Error('despotify_play(): ' + r));
    return;
  }

  // flag that this session is currently playing a track
  this.playing = true;

  // return the Readable Stream for this session
  return this.readable(true);
};

/**
 * Returns the Readable stream associated with this spotify session. The readable
 * pulls PCM audio data out of the session while "playing".
 */

Despotify.prototype.readable = function (force) {
  var self = this;
  var stream = this._readableStream;
  if (force || !stream) {
    if (stream) {
      // there's already an existing stream
      debug('destroying existing stream');
      stream.destroy();
    }
    // TODO: make configurable
    this._readableStream = stream = new Readable();
    stream._read = function (b, fn) {
      debug('_read(%d)', b);

      // get raw PCM data
      var pcm = new libdespotify.pcm_data();

      function read () {
        if (stream._gotEnd) return fn(null, null); // end

        libdespotify.get_pcm.async(self.session, pcm.buffer, onRead);
      }

      function onRead (err, rtn) {
        if (err) return fn(err);
        if (rtn) {
          // error reading...
          return fn(new Error('despotify_get_pcm(): ' + rtn));
        }
        var len = pcm.len;
        if (0 == len) {
          // no bytes :(
          return read();
        }

        if (!stream.format) {
          // TODO: emit "format" event
        }

        var buf = pcm.buf.buffer;
        if (buf.length != len) {
          buf = buf.slice(0, len);
        }
        debug('returning %d bytes of PCM data', len);
        fn(null, buf);
      }

      read();
    };
  }
  return stream;
};

/**
 * Logs out of the session and closes the connection to spotify.
 *
 * @api public
 */

Despotify.prototype.close =
Despotify.prototype.logout = function () {
  debug('logout()');
};

/**
 * Callback function that gets invoked for "events" related to
 * the Spotify session.
 *
 * @param {Buffer} session spotify session
 * @param {Number} signal which type of event this is
 * @param {Buffer} data event specific data
 * @api private
 */

Despotify.prototype._callback = function (session, signal, data) {
  debug('_callback(%d)', signal);

  switch (signal) {
    case 1: // new track
      var track = data.track.deref();
      debug('new track', track.title.buffer.toString().replace(/\0*$/, ''));
      this.emit('track', track);
      break;

    case 2: // time tell (seconds)
      var seconds = data.time.deref();
      debug('time tell', seconds);
      // HTML5 event name...
      this.emit('timeupdate', seconds);
      break;

    case 3: // end of playlist
      debug('end of playlist');
      // tell the Readable to emit "end" on the next _read() call
      this._readableStream._gotEnd = true;
      this.playing = false;
      break;

    case 4: // track play error (e.g. georestrictions)
      var str = lib.get_error(session);
      var err = new Error('track play error: ' + str);
      debug('track play error', str);
      this.emit('error', err);
      break;
  }
};

/**
 * Creates a callback function to use as the despotify callback function so that
 * we don't lose the "this" reference.
 *
 * @param {Despotify} session
 * @api private
 */

function callback (session) {
  return function () {
    return session._callback.apply(session, arguments);
  };
}
