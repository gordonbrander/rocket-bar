'use strict';

var assert = require('chai').assert;

var kicks = require('../kicks.js'),
    extend = kicks.extend;

describe('extend', function () {
  var a, b, ab;
  beforeEach(function () {
    a = { a: true, both: true };
    b = { b: true, both: false };
    ab = extend(a, b);
  });

  it('returns an object', function () {
    assert.typeOf(ab, 'object', 'ab is an object');
  });

  it('copies the keys and values from object b to object a', function () {
    assert.equal(ab.a, a.a, '.a still exists on ab');
    assert.equal(ab.b, b.b, '.b copied to ab');
  });

  it('favors object b when object a and b have the same key', function () {
    assert.equal(ab.both, false, 'ab.both has the value from b');
  });

  it('copies values to the first object, mutating it', function () {
    assert.equal(ab, a, 'ab and a are the same object');
  });
});
