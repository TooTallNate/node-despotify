
/**
 * Module dependencies.
 */

var ffi = require('ffi');
var debug = require('debug')('despotify');
var assert = require('assert');
var inherits = require('util').inherits;
var Track = require('./track');
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

  // gets set to a reference to a Track instance when a track is playing
  this.currentTrack = null;
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
    if (!rtn) return self.emit('error', new Error('despotify_authenticate() failed: ' + rtn));
    self.emit('login');
  });
};

/**
 * Begins playing a Spotify song via a URI. This will probably change...
 *
 * @param {Struct} track the "struct track" instance to begin playing
 * @param {Boolean} playAsList not really sure what this is for yet...
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

  // now we have to manually read PCM data until the "track" event is emitted
  track = null;
  var self = this;
  this.once('track', function (_track) {
    // at this point, the Track instance is responsible for reading PCM data
    track = _track;
  });

  var pcm = new libdespotify.pcm_data();
  function get_pcm () {
    self._pcm(pcm, after_get_pcm);
  }
  function after_get_pcm (err, rtn) {
    debug('after_get_pcm(%s, %s)', err, rtn);
    if (err) return self.emit('error', err);
    if (rtn) return self.emit('error', new Error('despotify_get_pcm() failed: ' + rtn));
    if (track) {
      track._data = pcm;
      // make the Track call _read() one time, so that the
      // "format" event has a chance to get emitted
      track.read(0);
    } else {
      assert.equal(pcm.len, 0, 'got unexpected PCM data with no "track": # bytes = ' + pcm.len);
      get_pcm();
    }
  }
  get_pcm();
};

/**
 * Plays the next track in the currently playing playlist.
 *
 * @return {Boolean}
 * @api public
 */

Despotify.prototype.next = function () {
  debug('next()');
  return libdespotify.next(this.session);
};

/**
 * Stops playback of the currently playing "track".
 *
 * @return {Boolean}
 * @api public
 */

Despotify.prototype.stop = function () {
  debug('stop()');
  return libdespotify.stop(this.session);
};

/**
 * Attempts to get another page of PCM data.
 * Used by the `Track` readable streams.
 *
 * @param {Struct} pcm `struct pcm_data` instance to fill
 * @param {Function} fn callback function to invoke when done
 * @api private
 */

Despotify.prototype._pcm = function (pcm, fn) {
  debug('_pcm()');
  libdespotify.get_pcm.async(this.session, pcm.buffer, fn);
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
      var track = new Track(data.track.deref(), this);
      track.readable = true;
      debug('new track', track.title);
      this.currentTrack = track;
      this.emit('track', track);
      break;

    case 2: // time tell (seconds)
      var seconds = data.time.deref();
      debug('time tell', seconds);
      // HTML5 event name...
      this.currentTrack.emit('timeupdate', seconds);
      break;

    case 3: // end of playlist
      debug('end of playlist');
      this.currentTrack = null;
      this.emit('end of playlist'); // XXX: better event name...
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
