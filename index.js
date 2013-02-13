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
var field = require('oops/field');
var query = require('oops/query');
var dropRepeats = require('transducer/drop-repeats');
var take = require('reducers/take');
var takeWhile = require('reducers/take-while');
var into = require('reducers/into');
var when = require('eventual/when');
var extend = require('./kicks').extend;
var Pattern = require('pattern-exp');

var apps = require('./assets/apps.json');
var contacts = require('./assets/contacts.json');
var music = require('./assets/music.json');
var web = require('./assets/web.json');

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
  contact: contacts,
  web: web
}

// Live stream of all the noun data paired with types.
var NOUNS = expand(Object.keys(data), function(type) {
  return map(data[type], function(noun) {
    return { type: type, noun: noun };
  });
});

// Create result stream.
//
// Find all apps with entries field.
var appsWithEntries = filter(apps, function (app) {
  return (app.entries) && (app.entries.length > 0);
});

// Transform all appsWithEntries into a flat list of entries, annotated with
// an `app` property that contains the `app.id`.
var entriesByApp = merge(map(appsWithEntries, function (app) {
  return map(app.entries, function (entry) {
    return extend(entry, { app: app.id });
  });
}));

var ENTRIES = mapWithSerializedByPredicate(entriesByApp, [
  [isMessageEntry, 'name', 'tel', 'content'],
  [isEmailEntry, 'name', 'email', 'content']
]);

// Supporting functions
// ----------------------------------------------------------------------------

function extendWithSerialized(object, keys) {
  // Add a property to an object, serialized, composed of concatenation of given
  // keys.
  return extend(object, { serialized: joinFields(object, keys) });
}

function mapWithSerializedByPredicate(reducible, steps) {
  return merge(map(steps, function (step) {
    var predicate = step[0];
    var keys = step.slice(1);
    return mapMatches(reducible, predicate, function (object) {
      return extendWithSerialized(object, keys);
    })
  }));
}

function joinFolder(string, accumulated) {
  // Join a reducible of strings into a single space-separated string.
  return !accumulated ? string : accumulated + ' ' + string;
}

function joinFields(object, keys) {
  // Join string fields into a single string.
  // Reducible -> String
  var values = map(keys, function (key) {
    return object[key];
  });

  return fold(values, joinFolder, '');
}

function isMessageEntry(entry) {
  // entry object -> bool
  return entry.app === 'messages.gaiamobile.org';
}

function isEmailEntry(entry) {
  return entry.app === 'email.gaiamobile.org';
}

function split(reducible, predicate) {
  // Set splitting function.
  // Split a reducible given a predicate function.
  // Returns a reducible of reducibles consisting of a reducible of the items
  // that match predicate, followed by a reducible of the items that do not
  // match predicate.
  function reversePredicate(item) {
    // Reverse the boolean return value of the predicate function.
    return !predicate(item);
  }
  return [
    filter(reducible, predicate),
    filter(reducible, reversePredicate)
  ];
}

function mapMatches(reducible, predicate, mapper) {
  // Map only matches for a given predicate.
  // Returns a reducible with only matches for predicate having been transformed
  // via `mapper()`.
  //
  // Reducible -> Reducible
  var xVsY = split(reducible, predicate);
  var mappedX = map(xVsY[0], mapper);
  return merge([mappedX, xVsY[1]]);
}

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

function compareGrepResults(a, b) {
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
  // Take the first 100 results and use those.
  var firstX = take(reducible, sampleSize);
  var bottomX = sort(firstX, sortingFunction);
  return reverse(bottomX);
}

function isLongerThan(reducible, length) {
  // Test if a reducible is greater than a given length.
  // Returns an eventual.
  var sample = into(take(reducible, length + 1), []);
  return when(sample, function (array) {
    return array.length > length;
  });
}

function convertQueryStringToPattern(queryString) {
  // Take a string representing search terms, escape it, prepare it and
  // turn it into a liberally matching pattern suitable for grep().
  //
  // Remove junk space.
  var trimmedString = queryString.trim();
  // Escape for RegExp safety.
  var escString = Pattern.escape(trimmedString);
  // Replace spaces between words with match pattern.
  var preppedString = escString.replace(/\s+/, '[^\\s]* ');
  // Create a RegExp pattern object via Pattern lib. Match globally and
  // case-insentitively.
  return Pattern(preppedString, 'i');
}

function createActionArticle(title, subtitle, className) {
  return '<article class="' + className + '">' +
    '<h1 class="title">' + title + '</h1>' +
    '<p class="subtitle">' + subtitle + '</p>' +
    '</article>';
}

function foldResultsHtml(result, string) {
  return string + createActionArticle(result.title, result.url, 'action-result');
}

function createResultsSectionHtml(results) {
  // Returns an eventual... maybe.
  var resultsHtml = fold(results, foldResultsHtml, '');
  return fold(resultsHtml, function (resultsHtml) {
    return resultsHtml ? '<section class="action-results">' +
    resultsHtml + '</section>' : '';
  });
}

function createTelHtml(context, results) {
  var resultsHtml = createResultsSectionHtml(results);
  var subtitle = context.trailing || context.tel;

  return '<article class="action-entry">' +
    '<h1 class="title">' + context.title + '</h1>' +
    '<span class="subtitle">' + subtitle + '</span>' +
    '</article>' + resultsHtml;
}

// Used by createMatchHTML.
var renderType = {
  'contacts.gaiamobile.org': createTelHtml,
  'messages.gaiamobile.org': createTelHtml,
  'dialer.gaiamobile.org': createTelHtml,

  'browser.gaiamobile.org': function(context, results) {
    var resultsHtml = createResultsSectionHtml(results);
    return '<article class="action-entry">' +
      '<h1 class="title">Web Results</h1>' +
      '<span class="subtitle">' + context.title + '</span>' +
      '</article>' + resultsHtml;
  },

  'default': function(context, results) {
    var resultsHtml = createResultsSectionHtml(results);
    var subtitle = context.trailing || context.subtitle || '';
    return '<article class="action-entry">' +
      '<h1 class="title">' + context.title + '</h1>' +
      '<span class="subtitle">' + subtitle + '</span>' +
      '</article>' +
      resultsHtml;
  }
};

function createMatchHtml(context, results) {
  // Creates the HTML string for a single match.
  var renderFunc = renderType[context.id] || renderType['default'];

  // Eventually, we need a better way to handle this stuff. Templating? Mustache? writer() from reflex?
  return renderFunc(context, results);
}

function foldMatchHtml(pair, string) {
  var result = createMatchHtml.apply(null, pair);
  return (string + '<li class="action-match ' + pair[0].className + '">' +
    result +
    '</li>');
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

function reduceHighlightMatchesHtml(string, match) {
  // Boldify substring matches in a string.
  return string.replace(match, '<b>' + match + '</b>');
}
function highlightMatchesHtml(string, matches) {
  // Highlight the substring matches in a string.
  return matches.reduce(reduceHighlightMatchesHtml, string);
}

function foldCompletionHtml(completion, html) {
  // Create the HTML string for a set of completions. Intended for use
  // with fold.
  return html + '<li class="action-completion">' + 
    '<span class="title">' +
    highlightMatchesHtml(completion.title, completion.matches) +
    '</span>' +
    '</li>';
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
  return event.target.value;
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

var clickedCompletionValuesOverTime = map(completionTitleElementsOverTime, function (element) {
  return element.textContent;
});

// Merge clicked suggested values stream and actionBar values stream.
// Create signal representing query terms entered into action bar,
// also repeats in `searchQuery` are dropped to avoid more work
// down the flow.
var searchQueriesOverTime = dropRepeats(merge([
  clickedCompletionValuesOverTime,
  actionBarValuesOverTime
]));

// Cached RegExp object for testing if a word exists in a query.
var reWord = /\S/;

// Split stream into 2 streams:
//
// 1. All queries that have words.
// 2. All queries that do not have words.
var wordsVsEmptyOverTime = split(searchQueriesOverTime, function containsWord(possibleWord) {
  return reWord.test(possibleWord);
});

var searchPatternPairsOverTime = map(wordsVsEmptyOverTime[0], function (string) {
  return [convertQueryStringToPattern(string), string];
});

// All queries that do not have words should be replaced by
// Start of Query marker.
var soqsOverTime = map(wordsVsEmptyOverTime[1], function (string) {
  return SOQ;
});

// A signal representing all nouns matching the current query over time.
var nounResultSetsOverTime = map(searchPatternPairsOverTime, function (pair) {
  var pattern = pair[0];
  // Search noun matches. Accesses closure variable NOUNS.
  var matchedNouns = grep(pattern, NOUNS, query("noun.serialized"));

  return {
    query: pair[1],
    matchedNouns: matchedNouns
  };
});

// Find all entry matches over time for the given query.
var entryResultSetsOverTime = map(searchPatternPairsOverTime, function (pair) {
  var pattern = pair[0];
  return grep(pattern, ENTRIES, query('serialized'));
});

var topEntryResultSetsOverTime = map(entryResultSetsOverTime, function sortTopResultSets(resultSet) {
  return sortFirstX(resultSet, 200, compareGrepResults);
});

var matchedNounSetsOverTime = map(nounResultSetsOverTime, function (nounResultSet) {
  return nounResultSet.matchedNouns;
});

var topNounSetsOverTime = map(matchedNounSetsOverTime, function (matchedNouns) {
  return sortFirstX(matchedNouns, 200, compareGrepResults);
});

var actionSetsOverTime = map(topNounSetsOverTime, function (matchedNouns) {
  print(matchedNouns);
  return expandNounMatchesToActions(matchedNouns, actionsByType);
});

var actionBarElement = document.getElementById('action-bar');

// TODO render entry results
fold(topEntryResultSetsOverTime, function (entryResultSet) {
  print(entryResultSet);
});

// Update action bar based on completion clicks.
fold(clickedCompletionValuesOverTime, function (value) {
  actionBarElement.value = value;
});

var matchesContainer = document.getElementById('matches');
var suggestionsContainer = document.getElementById('suggestions');

// Clear matches for every start of query over time.
fold(soqsOverTime, function () {
  matchesContainer.innerHTML = '';
  suggestionsContainer.innerHTML = '';
});

fold(actionSetsOverTime, function foldActionSetsOverTime(actions) {
  // Take only the top 20.
  var cappedResults = take(actions, 20);

  var resultsTemplateContexts = map(cappedResults, function resultToTemplateContext(result) {
    // Capture fake search results.
    var results = result.input.results;

    // Create a template object for basic compact view.
    var context = extend({
      id: result.app.id,
      className: escStringForClassname(result.app.id),
      title: compileCaption(result.action, result.input),
      trailing: ((result.action.parameterized && result.trailingText) ?
        result.trailingText :  ''),
      type: result.inputType
    }, result.input)

    // Sloppy. Ideally, we should split out results upstream. Or rather, they
    // should probably be a separate stream.
    delete context.results;

    // Return template context + results if we only have one match.
    // Otherwise return just the context.
    return [context, []];
  });

  // Create the amalgamated html string.
  var eventualResultsHtml = fold(resultsTemplateContexts, foldMatchHtml, '')

  // Wait for string to finish building, then assign as HTML.
  fold(eventualResultsHtml, function foldEventualResultsHtml(html) {
    matchesContainer.innerHTML = html;
  });
});

fold(nounResultSetsOverTime, function (nounResultSet) {
  var matchedNouns = nounResultSet.matchedNouns;
  var query = nounResultSet.query;

  // Filter out suggestions that are equivalent to the terms already in the
  // action bar.
  var validSuggestionTitles = filter(matchedNouns, function (nounResult) {
    var title = nounResult[0].noun.serialized;
    return title.toLowerCase() !== query.toLowerCase();
  });

  // Take the first 100 results and use as the sample size for sorting by score..
  var top100ValidSuggestions = sortFirstX(validSuggestionTitles, 100, compareGrepResults);
  var cappedSuggestions = take(top100ValidSuggestions, 3);

  // Transform the limited set of suggestions into strings.
  var suggestionTemplateContexts = map(cappedSuggestions, function fromSuggestionToTitleAndMatch(suggestion) {
    return {
      title: suggestion[0].noun.serialized,
      matches: suggestion[2]
    };
  });

  // Create an HTML string for each suggestion entry.
  // If there are no suggestions we'll end up reducing to an empty string, and
  // hence no suggestions are rendered. Perfect!
  var eventualSuggestionsHtml = fold(suggestionTemplateContexts, foldCompletionHtml, '');

  // Render the HTML for suggestions.
  fold(eventualSuggestionsHtml, function (html) {
    suggestionsContainer.innerHTML = html;
  });
});

if(navigator.mozApps) {
    var btn = document.getElementById('install');

    btn.addEventListener('click', function() {
        navigator.mozApps.install(location.href + 'manifest.webapp');
    });
    
    var req = navigator.mozApps.getSelf();
    req.onsuccess = function() {
        if(!req.result) {
            document.getElementById('install').style.display = 'block';
        }
    };
}
