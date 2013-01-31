/* vim:set ts=2 sw=2 sts=2 expandtab */
/*jshint asi: true undef: true es5: true node: true browser: true devel: true
forin: true latedef: false globalstrict: true*/

"use strict";

function Calculator(SCORE_BASE, SCORE_LENGTH) {
  var SCORE_INDEX = 1 - SCORE_BASE - SCORE_LENGTH
  return function score(match, input) {
    /**
Calculates the score for use in suggestions from
a result array `match` of `RegExp#exec`.
**/
    input = String(input)
    var length = input.length, value = null
    if (match) {
      value = SCORE_BASE +
              SCORE_LENGTH * Math.sqrt(match[0].length / length) +
              SCORE_INDEX * (1 - match.index / length)
    }
    return value
  }
}

var score = Calculator(0.3, 0.25)
score.make = Calculator

module.exports = score