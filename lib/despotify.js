
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
 * Module exports.
 */

module.exports = Despotify;

/**
 * The `Despotify` class encapsulates a "spotify session". You can play tracks
 * (one at a time), search the music library, and even get album art.
 *
 * @param {Object} opts pass "highBitrate" or "useCache" options
 * @api public
 */

function Despotify (opts) {
  if (!(this instanceof Despotify)) return new Despotify(highBitrate, useCache);
  EventEmitter.call(this);

  var highBitrate = (opts && opts.highBitrate) || false;
  var useCache = (opts && opts.useCache) || false;

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
  debug('play(%j, %s)', uri, playAsList);
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
 * Plays the next tracks in the currently playing playlist.
 *
 * @return {Boolean}
 * @api public
 */

Despotify.prototype.next = function () {
  debug('next()');
  libdespotify.next(this.session);
};

/**
 * Stops playback of the currently playing "track".
 *
 * @return {Boolean}
 * @api public
 */

Despotify.prototype.stop = function () {
  debug('stop()');
  libdespotify.stop(this.session);
};

/**
 * Attempts to get another page of PCM data.
 * Used by the `Track` readable streams.
 *
 * @param {Struct} pcm_data `struct pcm_data` instance to fill
 * @param {Function} fn callback function to invoke when done
 * @api private
 */

Despotify.prototype._pcm = function (pcm_data, fn) {
  debug('_pcm()');
  libdespotify.get_pcm.async(this.session, pcm_data.buffer, fn);
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
    this._readableStream = stream = new Readable({ lowWaterMark: 256 });
    stream._read = function (b, fn) {
      debug('_read(%d)', b);

      // get raw PCM data
      var pcm = new libdespotify.pcm_data();

      function get_pcm () {
        debug('get_pcm()');
        if (stream._gotEnd) return fn(null, null); // end
        self._pcm(pcm, after_get_pcm);
      }

      function after_get_pcm (err, rtn) {
        debug('after_get_pcm(%s, %s)', err, rtn);
        if (err) return fn(err);
        if (rtn) {
          // error reading...
          return fn(new Error('despotify_get_pcm(): ' + rtn));
        }
        var len = pcm.len;
        if (0 == len) {
          // no bytes :(
          return get_pcm();
        }

        // has a "format" event been emitted yet?
        if (!stream.format) {
          var format = {
            bitDepth: 16,
            signed: true,
            channels: pcm.channels,
            sampleRate: pcm.samplerate
          };
          stream.format = format;
          stream.emit('format', format);
        }

        // get a slice of the buffer (however much was written to it)
        // and send that slice out the readable end
        var buf = pcm.buf.buffer;
        if (buf.length != len) {
          buf = buf.slice(0, len);
        }
        debug('returning %d bytes of PCM data', len);
        fn(null, buf);
      }

      get_pcm();
    };

    // make _read() be called 1 time before the user gets ahold of it.
    // this gives the "format" event an opportunity to be run.
    //stream.read(0);
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
  this.emit('error', new Error('implement me!'));
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
  assert.equal(session.address(), this.session.address());

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
      var str = libdespotify.get_error(session);
      var err = new Error('track play error: ' + str);
      debug('track play error', str);
      this.emit('error', err);
      break;
  }
};

/**
 * Creates a callback function to use as the despotify callback function so that
 * we don't lose the "this" reference to the "session" instance.
 *
 * @param {Despotify} session
 * @api private
 */

function callback (session) {
  return function (_session, signal, data) {
    return session._callback(_session, signal, data);
  };
}
