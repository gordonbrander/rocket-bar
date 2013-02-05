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
var grep = require('./grep-reduce');
var compose = require('functional/compose');
var partial = require('functional/partial');
var field = require('oops/field');
var query = require('oops/query');
var dropRepeats = require('transducer/drop-repeats');
var take = require('reducers/take');
var takeWhile = require('reducers/take-while');
var into = require('reducers/into');
var when = require('eventual/when');

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
      return { name: name, action: action, app: app };
    });
  });
});

// Create live stream of all possible actions paired with types
// of nouns they can do actions on.
var actionsByType = expand(apps, function(app) {
  return expand(app.actions, function(action) {
    return map(action.params, function(type) {
      return { type: type, action: action, app: app };
    });
  });
});

// All the data available, probably interface will need to be different
// likely application should define hooks for nouns they can produce, such
// that services could be easily incorporated. For now only thing we really
// care about is `serialized` property that search will be performed over.
var data = {
  artist: music,
  contact: contacts
}

// Live stream of all the noun data paired with types.
var NOUNS = expand(Object.keys(data), function(type) {
  return map(data[type], function(noun) {
    return { type: type, noun: noun };
  });
});

// Supporting functions
// ----------------------------------------------------------------------------

// Takes action object and input for that action and returns string
// representing caption for the element rendered.
function compileCaption(action, input, trailingText) {
  var content = action.caption.replace('%', input.serialized);
  return content;
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

function compareMatches(a, b) {
  // Array.prototype.sort sorting function for ordering results.

  // a is less than b by some ordering criterion
  if (a.score < b.score) {
    return -1;
  }
  // a is greater than b by the ordering criterion.
  if (a.score > b.score) {
    return 1;
  }
  // a must be equal to b
  return 0;
}

function compareSuggestions(a, b) {
  // Array.prototype.sort sorting function for ordering results.

  // a is less than b by some ordering criterion
  if (a[1] < b[1]) {
    return -1;
  }
  // a is greater than b by the ordering criterion.
  if (a[1] > b[1]) {
    return 1;
  }
  // a must be equal to b
  return 0;
}

function sort(reducible, sortingFunction) {
  // Maybe a more efficient way to do this via reducible()?
  var eventualArray = into(reducible, []);
  return when(eventualArray, function (array) {
    // Sort the results by score -- highest first.
    return array.sort(sortingFunction);
  });
}

function reverse(reducible) {
  // Maybe a more efficient way to do this via reducible()?
  var eventualArray = into(reducible, []);
  return when(eventualArray, function (array) {
    return array.reverse();
  });
}

function sortFirstX(reducible, sampleSize, sortingFunction) {
  // Gives you the
  // Take the first 100 results and use those.
  var firstX = take(reducible, sampleSize);
  var bottomX = sort(firstX, sortingFunction);
  return reverse(bottomX);
}

// Used by createMatchHTML.
var renderType = {
  'contact': function(input, title, trailingText) {
    var subtitle = trailingText || input.tel;

    return '<article class="action-entry">' +
      '<h1 class="title">' + title + '</h1>' +
      '<span class="subtitle">' + subtitle + '</span>' +
      '</article>';
  },

  'default': function(input, title, trailingText) {
    var subtitle = trailingText || input.subtitle;
    return '<article class="action-entry">' +
      '<h1 class="title">' + title + '</h1>' +
      '<span class="subtitle">' + subtitle + '</span>' +
      '</article>';
  }
};

function createMatchHTML(match) {
  // Creates the HTML string for a single match.

  var appClassname = escStringForClassname(match.app.id);
  var title = compileCaption(match.action, match.input);
  var trailingText = (match.action.parameterized &&
                      match.trailingText) ? match.trailingText :  '';

  var renderFunc = renderType[match.inputType] || renderType['default'];

  // Eventually, we need a better way to handle this stuff. Templating? Mustache? writer() from reflex?
  return '<li class="action-match ' + appClassname + '">' +
    renderFunc(match.input, title, trailingText) +
    '</li>';
}

function searchWithVerb(terms) {
  var verbs = expand(terms, function(term) {
    return grep('^' + term, actionsByVerb, field("name"));
  });

  return expand(verbs, function(info) {
    // So far we don't support multiple action params so we just
    // pick the first one
    var app = info[0].app;
    var action = info[0].action;
    var verb = info[0].name;
    var score = info[1];
    var match = info[2];
    var trailingText = null;

    var i = terms.map(String.toLowerCase).indexOf(match[0]);
    var nounPattern;
    var suffix = "[^\\s]*";
    if(i === 0) {
      // The noun could be the next 1 or 2 words
      nounPattern = "";

      if(terms.length > 1) {
        nounPattern = terms[1] + suffix;

        if(terms.length > 2) {
          nounPattern += " (?:" + terms[2] + suffix + ")?";
        }
      }
      else {
        nounPattern = "";
      }
    }
    else if(i > 0) {
      // The noun precedes the verb
      var nouns = terms.slice(0, i);
      nounPattern = nouns.join(suffix + " ");
      trailingText = terms.slice(i + 1).join(" ");
    }
    else {
      // Should never get here since the matched term should always be
      // in `terms`
      alert('bad');
    }

    var type = action.params[0];
    var nouns = grep(nounPattern, data[type], field("serialized"));
    return map(nouns, function(info) {
      if(!trailingText) {
        var noun = info[2][0].replace(/^\s*|\s$/g, '');

        if(noun !== "") {
          var numWords = noun.split(/\s+/).length;
          // Slice off the noun plus the 1-word verb
          trailingText = terms.slice(numWords + 1).join(' ');
        }
      }

      return {
        app: app,
        action: action,
        // Should we should visually outline actual parts that match?
        input: info[0],
        inputType: type,
        score: score + info[1],
        trailingText: trailingText
      };
    });
  });
}

function grepNounMatches(terms, nouns) {
  // Return a stream of matches from a stream of nouns matching terms.
  // In this case we don't assume than any of the terms is a
  // verb so we create pattern for nouns from all the terms.
  var nounPattern = terms.join("[^\\s]* ");
  return grep(nounPattern, nouns, query("noun.serialized"));
}

function expandNounMatchesToActions(nounMatches, actionsByType) {
  return expand(nounMatches, function(pair) {
    var score = pair[1];
    var type = pair[0].type;
    var noun = pair[0].noun;

    // Filter verbs that can work with given noun type.
    var verbs = filter(actionsByType, function(verb) {
      return verb.type === type;
    });

    return map(verbs, function(verb) {
      return {
        app: verb.app,
        action: verb.action,
        input: noun,
        inputType: type,
        score: score
      };
    });
  });
}

// Control flow logic
// ----------------------------------------------------------------------------

var doc = document.documentElement;

// Catch all bubbled keypress events.
var keypressesOverTime = open(doc, 'keyup');
var clicksOverTime = open(doc, 'click');

// We're only interested in events on the action bar.
var actionBarPressesOverTime = filter(keypressesOverTime, function (event) {
  return event.target.id === 'action-bar';
});

// Create signal representing query entered into action bar.
var actionBarValuesOverTime = map(actionBarPressesOverTime, function (event) {
  return event.target.value.trim();
});

// Get all clicks that originated from an action-completion
var completionClicksOverTime = filter(clicksOverTime, function (event) {
  return event.target.className === 'action-completion';
});
var clickedCompletionTitleElementsOverTime = map(completionClicksOverTime, function (event) {
  return event.target.getElementsByClassName('title')[0];
});

// Get all clicks that originated from an action-completion
var completionTitleClicksOverTime = filter(clicksOverTime, function (event) {
  return (
    event.target.className === 'title' &&
    event.target.parentNode.className === 'action-completion'
  );
});

var clickedTitlesOfCompletionElementsOverTime = map(completionTitleClicksOverTime, function (event) {
  return event.target;
});

var completionTitleElementsOverTime = merge([
  clickedCompletionTitleElementsOverTime,
  clickedTitlesOfCompletionElementsOverTime
]);

var completionValuesOverTime = map(completionTitleElementsOverTime, function (element) {
  return element.textContent;
});

// Merge clicked suggested values stream and actionBar values stream.
// Create signal representing query terms entered into action bar,
// also repeats in `searchQuery` are dropped to avoid more work
// down the flow.
var searchQueriesOverTime = dropRepeats(merge([
  completionValuesOverTime,
  actionBarValuesOverTime
]));

// Continues signal representing search results for the entered query.
// special `SOQ` value is used at as delimiter to indicate results for
// new query. This can be used by writer to flush previous inputs and
// start writing now ones.
var resultSetsOverTime = map(searchQueriesOverTime, function(query) {
  var terms = query.split(/\s+/);

  if (!terms.length || !terms[0]) return SOQ;

  // Search noun matches. Accesses closure variable NOUNS.
  var nounMatches = grepNounMatches(terms, NOUNS);

  return {
    query: query,
    suggestions: nounMatches,
    actions: merge([ searchWithVerb(terms), expandNounMatchesToActions(nounMatches, actionsByType) ])
  };
});

var actionBarElement = document.getElementById('action-bar');

// Update 
fold(completionValuesOverTime, function (value) {
  actionBarElement.value = value;
});

var matchesContainer = document.getElementById('matches');
var suggestionsContainer = document.getElementById('suggestions');

fold(resultSetsOverTime, function (resultSet) {
  var actions = resultSet.actions;
  var suggestions = resultSet.suggestions;

  // Take the first 100 results and use as the sample size for sorting by score..
  var top100Actions = sortFirstX(actions, 100, compareMatches);
  // And take only the top 20.
  var cappedResults = take(top100Actions, 20);

  // Create the amalgamated HTML string.
  var eventualHtml = fold(cappedResults, function (match, matches) {
    return matches + createMatchHTML(match);
  }, '');

  // Wait for string to finish building, then assign as HTML.
  fold(eventualHtml, function (html) {
    matchesContainer.innerHTML = html;
  });

  // Take the first 100 results and use as the sample size for sorting by score..
  var top100Suggestions = sortFirstX(suggestions, 100, compareSuggestions);
  var cappedSuggestions = take(top100Suggestions, 3);
  
  // Transform the limited set of suggestions into strings.
  var suggestionTitles = map(cappedSuggestions, function (suggestion) {
    return suggestion[0].noun.serialized;
  });

  // Filter out suggestions that are equivalent to the terms already in the
  // action bar.
  var validSuggestionTitles = filter(suggestionTitles, function (title) {
    return title.toLowerCase() !== resultSet.query.toLowerCase();
  });

  // Create an HTML string for each suggestion entry.
  // If there are no suggestions we'll end up reducing to an empty string, and
  // hence no suggestions are rendered. Perfect!
  var eventualSuggestionsHtml = fold(validSuggestionTitles, function (title, html) {
    return html + '<li class="action-completion">' + 
      '<span class="title">' +
      title +
      '</span>' +
      '</li>'
  }, '');

  // Render the HTML for suggestions.
  fold(eventualSuggestionsHtml, function (html) {
    suggestionsContainer.innerHTML = html;
  });

  // Filter actions down to "start of query" actions.
  var SOQs = filter(actions, function (match) {
    return match === SOQ;
  });

  // Clear matches for every start of query.
  fold(SOQs, function () {
    matchesContainer.innerHTML = '';
  });
});

