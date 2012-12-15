
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

  var self = this;
  var pcm = this._data;

  if (pcm) {
    debug('got _data');
    // _data gets set on the very first chunk of PCM data, which is actually read
    // by the spotify "session" instance rather than the Track
    this._data = null;
    return after_get_pcm(null, 0);
  }

  // get raw PCM data
  pcm = new libdespotify.pcm_data();

  function get_pcm () {
    debug('get_pcm()');
    if (self.session.currentTrack === self) {
      self.session._pcm(pcm, after_get_pcm);
    } else {
      debug('currentTrack !== this');
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

    // has a "format" event been emitted yet?
    if (!self.format) {
      var format = {
        bitDepth: 16,
        signed: true,
        channels: pcm.channels,
        sampleRate: pcm.samplerate
      };
      self.format = format;
      self.emit('format', format);
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
