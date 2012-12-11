
var login = require('./login');
var Despotify = require('./');
var Speaker = require('speaker');

var spotify = new Despotify(true);
spotify.login(login.username, login.password, function (err) {
  if (err) throw err;

  // Champagne supernova
  var uri = process.argv[2] || 'spotify:track:4Jgp57InfWE4MxJLfheNVz';
  var readable = spotify.play(uri);
  readable.on('format', function (format) {
    console.error('"format" event:', format);
  });
  readable.pipe(new Speaker());

  spotify.on('track', function (track) {
    console.error(track.file_id);
    console.error(track.file_bitrate);
    console.error(track.key);
    console.error(track.allowed);
    console.error(track.forbidden);
    console.error(track.length);
    console.error(track.year);
  });
});
