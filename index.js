
/**
 * Module dependencies.
 */

var assert = require('assert');
var libdespotify = require('./lib/libdespotify');

/**
 * Initialization / tear down.
 */

assert(libdespotify.init(), 'despotify_init() failed');
process.on('exit', function () {
  assert(libdespotify.cleanup(), 'despotify_cleanup() failed');
});

/**
 * Export the Despotify constructor.
 */

module.exports = require('./lib/despotify');
