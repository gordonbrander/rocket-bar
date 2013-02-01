/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Imports
// ----------------------------------------------------------------------------

var filter = require('reducers/filter');
var map = require('reducers/map');
var expand = require('reducers/expand');
var concat = require('reducers/concat');
var merge = require('reducers/merge');
var fold = require('reducers/fold');
var open = require('dom-reduce/event');
var print = require('reducers/debug/print');
var zip = require('zip-reduce');
var grep = require('grep-reduce');
var compose = require('functional/compose');
var partial = require('functional/partial');
var field = require('oops/field');
var query = require('oops/query');
var dropRepeats = require('transducer/drop-repeats');

var kicks = require('./kicks.js'),
    apply = kicks.apply,
    slice = kicks.slice,
    reverse = kicks.reverse,
    lambda = kicks.lambda,
    extend = kicks.extend;


var apps = require('./assets/apps.json');
var contacts = require('./assets/contacts.json');
var music = require('./assets/music.json');

var SOQ = new String('Start of query');

// Create live stream of all possible actions paired with verbs
// these actions recognize.
var actionsByVerb = expand(apps, function(app) {
  return expand(app.actions, function(action) {
    return map(action.names, function(name) {
      return { name: name, action: action, app: app }
    })
  })
})

// Create live stream of all possible actions paired with types
// of nouns they can do actions on.
var actionsByType = expand(apps, function(app) {
  return expand(app.actions, function(action) {
    return map(action.params, function(type) {
      return { type: type, action: action, app: app }
    })
  })
})

// All the data available, probably interface will need to be different
// likely application should define hooks for nouns they can produce, such
// that services could be easily incorporated. For now only thing we really
// care about is `serialized` property that search will be performed over.
var data = {
  artist: map(music, function(name) {
    return {
      artist: name,
      serialized: name
    }
  }),
  contact: map(contacts, function(name) {
    return {
      serialized: name,
      name: name,
      org: '',
      tel: '',
      url: '',
      adr: {
        street_address: '',
        locality: '',
        region: '',
        postal_code: '',
        country_name: ''
      },
      note: ''
    }
  })
}

// Live stream of all the noun data paired with types.
var nouns = expand(Object.keys(data), function(type) {
  return map(data[type], function(noun) {
    return { type: type, noun: noun }
  })
})

// Supporting functions
// ----------------------------------------------------------------------------

// Takes action object and input for that action and returns string
// representing caption for the element rendered.
function compileCaption(action, input) {
  return action.caption.replace('%', input.serialized);
}

function escStringForClassname(string) {
  return string.replace(/\~|\!|\@|\$|\%|\^|\&|\*|\(|\)|\_|\+|\-|\=|\,|\.|\/|\'|\;|\:|\"|\?|\>|\<|\[|\]|\\|\{|\}|\||\`|\#/g, '-');
}

// Create cached dummy element for function.
var dummyEl = document.createElement('div');

function createElementFromString(string) {
  // Create a DOM node from an HTML string.
  // Requires DOM.
  //
  // Assign as innerHTML.
  dummyEl.innerHTML = string;
  // Return the now-generated DOM nodes.
  return dummyEl.firstChild;
}

// Control flow logic
// ----------------------------------------------------------------------------

var doc = document.documentElement;

// Catch all bubbled keypress events.
var keypressesOverTime = open(doc, 'keyup');

// We're only interested in events on the action bar.
var actionBarPressesOverTime = filter(keypressesOverTime, function (event) {
  return event.target.id === 'action-bar';
});

// Create signal representing query entered into action bar.
var searchQuery = map(actionBarPressesOverTime, function (event) {
  return event.target.value.trim();
});

// Create signal representing query terms entered into action bar,
// also repeats in `searchQuery` are dropped to avoid more work
// down the flow.
var searchTerms = map(dropRepeats(searchQuery), function(query) {
  return query.split(/\s+/);
});


function searchWithVerb(verb, terms) {
  // We must be more intelligent than this but so far we assume
  // that the verb is either first term or last.
  var verbPattern = "^" + verb + "|^$"
  // The rest terms are joined such that they can represent beginnings
  // of the words.
  var nounPattern = terms.join("[^\\s]* ")
  var verbs = grep(verbPattern, actionsByVerb, field("name"))

  return expand(verbs, function(pair) {
    // So far we don't support multiple action params so we just
    // pick the first one
    var app = pair[0].app
    var action = pair[0].action
    var score = pair[1]

    var type = action.params[0]
    var nouns = grep(nounPattern, data[type], field("serialized"))
    return map(nouns, function(pair) {
      return {
        app: app,
        action: action,
        // Should we should visually outline actual parts that match?
        input: pair[0],
        score: score + pair[1]
      }
    })
  })
}

function searchWithNoun(terms) {
  // In this case we don't assume than any of the terms is a
  // verb so we create pattern for nouns from all the terms.
  var nounPattern = terms.join("[^\\s]* ")
  var matches = grep(nounPattern, nouns, query("noun.serialized"))
  return expand(matches, function(pair) {
    var score = pair[1]
    var type = pair[0].type
    var noun = pair[0].noun
    // Filter verbs that can work with given noun type.
    var verbs = filter(actionsByType, function(verb) {
      return verb.type === type
    })

    return map(verbs, function(verb) {
      return {
        app: verb.app,
        action: verb.action,
        input: noun,
        score: score
      }
    })
  })
}

// Continues signal representing search results for the entered query.
// special `SOQ` value is used at as delimiter to indicate results for
// new query. This can be used by writer to flush previous inputs and
// start writing now ones.
var results = expand(searchTerms, function(terms) {
  if (!terms.length || !terms[0]) return SOQ

  var count = terms.length
  var first = terms[0]
  var last = terms[count - 1]

  return concat(SOQ, merge([
    searchWithVerb(first, terms.slice(1)),
    searchWithVerb(last, terms.slice(0, count - 1))
  ]), searchWithNoun(terms))
})

function renderActions(input, target) {
  fold(input, function(match, result) {
    // reset view (probably instead of removing it would be better to move
    // it down and dim a little to make it clear it's history and not a match.
    if (match === SOQ) {
      target.innerHTML = ""
      return []
    }

    var appClassname = escStringForClassname(match.app.id);
    var title = compileCaption(match.action, match.input);
    // Eventually, we need a better way to handle this stuff. Templating? Mustache? writer() from reflex?
    var view = createElementFromString('<li class="action-match ' + appClassname + '"><article class="action-entry"><h1 class="title">' + title + '</h1></article></li>');

    // TODO: We should do binary search instead, but we
    // can optimize this later.
    result.push(match.score)
    result = result.sort().reverse()
    var index = result.lastIndexOf(match.score)
    var prevous = target.children[index]

    target.insertBefore(view, prevous)

    return result
  }, [])
}

renderActions(results,  document.getElementById('matches'))
