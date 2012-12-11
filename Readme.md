node-despotify
==============
### NodeJS binding to libdespotify

This module wraps `libdespotify`, allowing you to conduct a Spotify session
programatically, doing things like searching for songs and artists, getting album
art, and even getting PCM audio data of the song currently playing!


Installation
------------

You need `libdespotify` installed. On OS X:

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

Here's an example of initiating a Spotify session, and then retrieving the PCM
audio data of a song and outputing it through `node-speaker`:

``` js
var Speaker = require('speaker');
var Despotify = require('despotify');

// specify your Spotify username and password as env variables
var username = process.env.USERNAME;
var password = process.env.PASSWORD;

// create a "spotify" session
var spotify = new Despotify();

// login to the spotify server
spotify.login(username, password, function (err) {
  if (err) throw err;

  // get a track by URI - Champagne supernova
  var uri = 'spotify:track:4Jgp57InfWE4MxJLfheNVz';

  // begin playing the song; a Readable stream is returned
  var readable = spotify.play(uri);
  readable.on('format', function (format) {
    console.error('"format" event:', format);
  });
  readable.pipe(new Speaker());
});
```
