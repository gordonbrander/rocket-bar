"use strict";

var filter = require("reducers/filter")
var map = require("reducers/map")
var Pattern = require("pattern-exp")
var score = require("./match-score")

function isPositiveScore(data) { return data[1] > 0 }

function grep(pattern, data, serialize) {
  /**
Function returns values from `data` paired with the match score for
`pattern`. If there is no match value will be excluded from the result.

## Examples

**/
 
  if (typeof(serialize) !== "function") serialize = String
  // Creating pattern from the given input.
  pattern = Pattern(pattern || "", "i")
  // Map to data value and pattern match score pairs.
  var scoredData = map(data, function(value) {
    var val = serialize(value)
    var match = pattern.exec(val)

    // PATCH: return the actual match info so we can do stuff with it (jwl)
    return [ value, score(match, val), match ]
  })
  // Filter only matches who's score is positive.
  return filter(scoredData, isPositiveScore)
}

module.exports = grep