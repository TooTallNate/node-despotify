node-despotify
==============
### NodeJS binding to libdespotify

This module wraps `libdespotify`, allowing you to conduct a Spotify session
programatically, doing things like searching for songs and artists, getting album
art, and even getting PCM audio data of the song currently playing!


Installation
------------

You need [`libdespotify`](http://despotify.se/source-code/) installed. On OS X
with Homebrew, run:

``` bash
$ brew install --HEAD despotify
```

`node-despotify` is currently not published on npm, while under heavy development.
You can install the tarball from the `master` branch directly:

``` bash
$ npm install https://github.com/TooTallNate/node-despotify/archive/master.tar.gz
```


Example
-------

Here's an example of initiating a Spotify session, starting a track to play, and
piping the audio data to the speakers using `node-speaker`:

``` js
var Speaker = require('speaker');
var Despotify = require('despotify');

// log in using your Spotify credentials - a Premium account is required
var username = 'billybob';
var password = 't3hSekretz';

// create a "spotify" session
var spotify = new Despotify();

// login to the spotify server
spotify.login(username, password, function (err) {
  if (err) throw err;

  // get a track by URI - Champagne supernova
  var uri = 'spotify:track:4Jgp57InfWE4MxJLfheNVz';

  // begin playing the song - a "track" event will be emitted soon
  spotify.play(uri);

  // the "track" event is emitted when a new track is beginning to play.
  // the "track" object is a Readable stream the outputs PCM audio data.
  spotify.on('track', function (track) {
    console.log('new "track" starting: %j', track.title);

    // the track's "format" event gets emitted when the PCM audio format is
    // determined. at this point you probably want to start reading...
    track.on('format', function (format) {
      track.pipe(new Speaker(format));
    });
  });
});
```
