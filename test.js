
var login = require('./login');
var Despotify = require('./');
var Speaker = require('speaker');

var spotify = new Despotify({ highBitrate: true });
spotify.login(login.username, login.password, function (err) {
  if (err) throw err;

  // Champagne supernova
  var uri = process.argv[2] || 'spotify:track:4Jgp57InfWE4MxJLfheNVz';
  spotify.play(uri);

  spotify.on('track', function (track) {
    console.error('"track" event');
    console.error('title: %j', track.title);
    console.error('album: %j', track.album);
    console.error('bitrate: %d kbit/s', track.bitrate / 1000);
    console.error('track id: %j', track.trackId);
    console.error('cover id: %j', track.coverId);
    console.error('length: %j', track.length);

    // the spotify "track" is also a Readable stream instance
    track.on('format', function (format) {
      console.error('track "format" event:', format);
      track.pipe(new Speaker(format));
    });
    track.on('end', function () {
      console.error('track "end" event');
    });
    track.on('error', function (err) {
      console.error('track "error" event:', err);
    });

  });
});
