
/**
 * Module dependencies.
 */

var assert = require('assert');
var inherits = require('util').inherits;
var Readable = require('stream').Readable;
var debug = require('debug')('despotify:track');
var libdespotify = require('./libdespotify');

// node v0.8.x compat
if (!Readable) Readable = require('readable-stream/readable');


/**
 * Module exports.
 */

module.exports = Track;

/**
 * The `Track` class is a Readable stream that output PCM audio data. You don't
 * create instances of these manually, however they are created and returned when
 * a "track" event is emitted.
 *
 * @param {Struct} track `struct track` instance
 * @api private
 */

function Track (track, session) {
  Readable.call(this);

  // track instances start out as *not* readable by default
  this.readable = false;

  // keep a reference to the struct instance
  this.track = track;

  // keep a reference to the spotify "session" instance
  this.session = session;
}
inherits(Track, Readable);

/**
 * Readable base class _read() callback function. Reads PCM audio data from the
 * track while playing during the spotify session.
 *
 * @param {Number} b requested number of bytes to read (ignored)
 * @param {Function} fn callback function to invoke when done
 * @api private
 */

Track.prototype._read = function (b, fn) {
  debug('_read(%d)', b);

  // get raw PCM data
  var self = this;
  var session = this.session;
  var pcm = new libdespotify.pcm_data();

  function get_pcm () {
    debug('get_pcm()');
    if (session.currentTrack === self) {
      session._pcm(pcm, after_get_pcm);
    } else {
      // this track isn't playing anymore... emit "end" event
      fn(null, null); // end
    }
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
  }

  get_pcm();
};

/**
 * Gets a String URI from this "track" instance.
 *
 * @return {String} track uri
 * @api public
 */

Track.prototype.uri = function () {

};

/**
 * Proxy `struct track` properties.
 */

var names = {
  'hasMetadata': 'has_meta_data',
  'playable': 'playable',
  'geoRestricted': 'geo_restricted',
  'trackId': 'track_id',
  'fileId': 'file_id',
  'bitrate': 'file_bitrate',
  'albumId': 'album_id',
  'coverId': 'cover_id',
  'key': 'key',
  'allowed': 'allowed',
  'forbidden': 'forbidden',
  'title': 'title',
  'artist': 'artist',
  'album': 'album',
  'length': 'length',
  'trackNumber': 'tracknumber',
  'year': 'year',
  'popularity': 'popularity'
};

Object.keys(names).forEach(function (name) {
  var get;
  var prop = names[name];
  if (libdespotify.track.fields[prop].type.fixedLength > 0) {
    // a char[] type, we must convert to a JS String
    get = function () {
      return this.track[prop].buffer.reinterpretUntilZeros(1).toString();
    };
  } else {
    get = function () {
      return this.track[prop];
    };
  }
  Object.defineProperty(Track.prototype, name, { get: get });
});
