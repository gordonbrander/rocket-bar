/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Imports
// ----------------------------------------------------------------------------

var filter = require('reducers/filter');
var map = require('reducers/map');
var merge = require('reducers/merge');
var fold = require('reducers/fold');
var open = require('dom-reduce/event');
var print = require('reducers/debug/print');
var zip = require('zip-reduce');
var grep = require('grep-reduce');
var kicks = require('./kicks.js'),
    apply = kicks.apply,
    compose = kicks.compose,
    slice = kicks.slice,
    reverse = kicks.reverse,
    lambda = kicks.lambda,
    fill = kicks.fill,
    extend = kicks.extend;

// Supporting functions
// ----------------------------------------------------------------------------

function getSearchSerialization(action) {
  // Return the searchable field of the object. This function is used to
  // map actions before grepping. It's also a useful abstraction in case we
  // change the searchable field mechanism in future.
  return action.searchable;
}

function getDisplaySerialization(action) {
  return action.display;
}

// FakeDB
// ----------------------------------------------------------------------------

var NAMES = [
  'Matt Helm',
  'Hal Ambler',
  'Ali Imran',
  'Jane Blonde',
  'Basil Argyros',
  'Modesty Blaise',
  'Sir Alan Blunt',
  'James Bond',
  'Felix Leiter',
  'Nancy Drew',
  'Sherlock Holmes',
  'Jason Bourne',
  'Tim Donohue',
  'Sam Fisher',
  'Stephen Metcalfe',
  'Jack Ryan',
  'Nick Fury',
  'Ada Wong',
  'Jack Bauer',
  'Sydney Bristow',
  'Ethan Hunt',
  'Wyman Ford',
  'Nick Carter-Killmaster',
  'Johnny Fedora',
  'Tamara Knight',
  'Mitch Rapp',
  'Michael Jagger',
  'George Smiley',
  'Simon Templar',
  'Philip Quest',
  'Mortadelo Pi',
  'Filemón Pi',
  'Maria Hill'
];

var CONTACTS_ACTIONS = map(NAMES, function(name) {
  // Generate mock contact structure...
  return {
    fn: name,
    app: 'contacts.gaiamobile.org',
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
    note: '',
    display: name,
    searchable: name
  };
});

var DIALER_ACTIONS = map(NAMES, function(name) {
  return {
    fn: name,
    app: 'dialer.gaiamobile.org',
    tel: '(555) 555-5555',
    display: name,
    searchable: (name + ' call dial')
  };
});

var MESSAGE_ACTIONS = map(NAMES, function(name) {
  // Generate mock contact structure...
  return {
    fn: name,
    app: 'messages.gaiamobile.org',
    tel: '(555) 555-5555',
    display: name,
    searchable: (name + ' sms mms msg txt text')
  };
});

var ARTIST_ACTIONS = map([
  'The Album Leaf',
  'Ali Farka Toure',
  'Amiina',
  'Anni Rossi',
  'Arcade Fire',
  'Arthur & Yu',
  'Au',
  'Band of Horses',
  'Beirut',
  'Billie Holiday',
  'Burial',
  'Wilco',
  'Justice',
  'Bishop Allen',
  'Sigur Ros',
  'Bjork',
  'The Black Keys',
  'Bob Dylan',
  'Bodies of Water',
  'Bon Iver',
  'Counting Crows',
  'Death Cab for Cutie',
  'Fleet Foxes',
  'Fleetwood Mac',
  'The Innocence Mission'
], function (artistName) {
  return {
    fn: artistName,
    type: 'artist',
    app: 'music.gaiamobile.org',
    display: artistName,
    // The text field that is searched with Grep.
    // Generally speaking this should be the subject plus a few
    // verb keywords.
    searchable: (artistName + ' play listen music')
  };
});

var allActions = merge([
  CONTACTS_ACTIONS,
  MESSAGE_ACTIONS,
  DIALER_ACTIONS,
  ARTIST_ACTIONS
]);

// Control flow logic
// ----------------------------------------------------------------------------

var doc = document.documentElement;

// Catch all bubbled keypress events.
var keypressesOverTime = open(doc, 'keyup');

// We're only interested in events on the action bar.
var actionBarPressesOverTime = filter(keypressesOverTime, function (event) {
  return event.target.id === 'action-bar';
});

// Get the list of values in the action bar over time.
var actionBarValuesOverTime = map(actionBarPressesOverTime, function (event) {
  return event.target.value;
});

// Grep list of strings.
var scoredActionListsOverTime = map(actionBarValuesOverTime, function (value) {
  return grep(value, allActions, getSearchSerialization);
});

// Find the matches container.
var matchesContainerEl = document.getElementById('matches');

var limitedActionListsOverTime = map(scoredActionListsOverTime, function (matches) {
  return take(matches, 20);
});

// Begin folding the value... kicks off processing.
fold(scoredActionListsOverTime, function(matches) {
  var eventualHtmlString = fold(matches, function (pair, html) {
    var action = pair[0];
    return html + '<li class="">' + getDisplaySerialization(action) + '</li>';
  }, '');

  fold(eventualHtmlString, function (htmlString) {
    return matchesContainerEl.innerHTML = htmlString;
  });
});

fold(scoredActionListsOverTime, function (matches) {
  print(matches);
});
