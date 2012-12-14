
/**
 * Module dependencies.
 */

var libdespotify = require('./lib/libdespotify');

/**
 * Initialization / tear down.
 */

assert(libdespotify.init());
process.on('exit', function () {
  assert(libdespotify.cleanup());
});

/**
 * Export the Despotify constructor.
 */

module.exports = require('./lib/despotify');
