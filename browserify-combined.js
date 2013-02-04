(function(){var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var cached = require.cache[resolved];
    var res = cached? cached.exports : mod();
    return res;
};

require.paths = [];
require.modules = {};
require.cache = {};
require.extensions = [".js",".coffee",".json",".html",".svg",".jade",".less"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';

        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';

        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }

        var n = loadNodeModulesSync(x, y);
        if (n) return n;

        throw new Error("Cannot find module '" + x + "'");

        function loadAsFileSync (x) {
            x = path.normalize(x);
            if (require.modules[x]) {
                return x;
            }

            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }

        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = path.normalize(x + '/package.json');
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }

            return loadAsFileSync(x + '/index');
        }

        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }

            var m = loadAsFileSync(x);
            if (m) return m;
        }

        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');

            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }

            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);

    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key);
        return res;
    })(require.modules);

    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

(function () {
    var process = {};
    var global = typeof window !== 'undefined' ? window : {};
    var definedProcess = false;

    require.define = function (filename, fn) {
        if (!definedProcess && require.modules.__browserify_process) {
            process = require.modules.__browserify_process();
            definedProcess = true;
        }

        var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;

        var require_ = function (file) {
            var requiredModule = require(file, dirname);
            var cached = require.cache[require.resolve(file, dirname)];

            if (cached && cached.parent === null) {
                cached.parent = module_;
            }

            return requiredModule;
        };
        require_.resolve = function (name) {
            return require.resolve(name, dirname);
        };
        require_.modules = require.modules;
        require_.define = require.define;
        require_.cache = require.cache;
        var module_ = {
            id : filename,
            filename: filename,
            exports : {},
            loaded : false,
            parent: null
        };

        require.modules[filename] = function () {
            require.cache[filename] = module_;
            fn.call(
                module_.exports,
                require_,
                module_,
                module_.exports,
                dirname,
                filename,
                process,
                global
            );
            module_.loaded = true;
            return module_.exports;
        };
    };
})();


require.define("path",function(require,module,exports,__dirname,__filename,process,global){function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

});

require.define("__browserify_process",function(require,module,exports,__dirname,__filename,process,global){var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
        && window.setImmediate;
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    if (name === 'evals') return (require)('vm')
    else throw new Error('No such module. (Possibly not yet loaded)')
};

(function () {
    var cwd = '/';
    var path;
    process.cwd = function () { return cwd };
    process.chdir = function (dir) {
        if (!path) path = require('path');
        cwd = path.resolve(dir, cwd);
    };
})();

});

require.define("/node_modules/reducers/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {}
});

require.define("/node_modules/reducers/filter.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var reducer = require("./reducer")

var filter = reducer(function filter(predicate, next, value, result) {
  /**
  Composes filtered version of given `source`, such that only items contained
  will be once on which `f(item)` was `true`.

  ## Example

  var digits = filter([ 10, 23, 2, 7, 17 ], function(value) {
    return value >= 0 && value <= 9
  })
  print(digits) // => < 2 7 >
  **/
  return predicate(value) ? next(value, result) :
         result
})

module.exports = filter

});

require.define("/node_modules/reducers/reducer.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var reduce = require("reducible/reduce")
var reducible = require("reducible/reducible")
var isError = require("reducible/is-error")
var end = require("reducible/end")


function reducer(process) {
  /**
  Convenience function to simplify definitions of transformation function, to
  avoid manual definition of `reducible` results and currying transformation
  function. It creates typical transformation function with a following
  signature:

      transform(source, options)

  From a pure data `process` function that is called on each value for a
  collection with following arguments:

    1. `options` - Options passed to the resulting transformation function
       most commonly that's a function like in `map(source, f)`.
    2. `next` - Function which needs to be invoked with transformed value,
       or simply not called to skip the value.
    3. `value` - Last value emitted by a collection being reduced.
    4. `result` - Accumulate value.

  Function is supposed to return new, accumulated `result`. It may either
  pass mapped transformed `value` and `result` to the `next` continuation
  or skip it.

  For example see `map` and `filter` functions.
  **/
  return function reducer(source, options) {
    // When return transformation function is called with a source and
    // `options`
    return reducible(function reduceReducer(next, initial) {
      // When actual result is 
      reduce(source, function reduceReducerSource(value, result) {
        // If value is `end` of source or an error just propagate through,
        // otherwise call `process` with all the curried `options` and `next`
        // continuation function.
        return value === end ? next(value, result) :
               isError(value) ? next(value, result) :
               process(options, next, value, result)
      })
    })
  }
}

module.exports = reducer

});

require.define("/node_modules/reducible/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./reducible.js"}
});

require.define("/node_modules/reducible/reduce.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var method = require("method")

var isReduced = require("./is-reduced")
var isError = require("./is-error")
var end = require("./end")

var reduce = method("reduce")

// Implementation of `reduce` for the empty collections, that immediately
// signals reducer that it's ended.
reduce.empty = function reduceEmpty(empty, next, initial) {
  next(end, initial)
}

// Implementation of `reduce` for the singular values which are treated
// as collections with a single element. Yields a value and signals the end.
reduce.singular = function reduceSingular(value, next, initial) {
  next(end, next(value, initial))
}

// Implementation of `reduce` for the array (and alike) values, such that it
// will call accumulator function `next` each time with next item and
// accumulated state until it's exhausted or `next` returns marked value
// indicating that it's reduced. Either way signals `end` to an accumulator.
reduce.indexed = function reduceIndexed(indexed, next, initial) {
  var state = initial
  var index = 0
  var count = indexed.length
  while (index < count) {
    var value = indexed[index]
    state = next(value, state)
    index = index + 1
    if (value === end) return end
    if (isError(value)) return state
    if (isReduced(state)) return state.value
  }
  next(end, state)
}

// Both `undefined` and `null` implement accumulate for empty sequences.
reduce.define(void(0), reduce.empty)
reduce.define(null, reduce.empty)

// Array and arguments implement accumulate for indexed sequences.
reduce.define(Array, reduce.indexed)

function Arguments() { return arguments }
Arguments.prototype = Arguments()
reduce.define(Arguments, reduce.indexed)

// All other built-in data types are treated as single value collections
// by default. Of course individual types may choose to override that.
reduce.define(reduce.singular)

// Errors just yield that error.
reduce.define(Error, function(error, next) { next(error) })
module.exports = reduce

});

require.define("/node_modules/method/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./core.js"}
});

require.define("/node_modules/method/core.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var defineProperty = Object.defineProperty || function(object, name, property) {
  object[name] = property.value
  return object
}

// Shortcut for `Object.prototype.toString` for faster access.
var typefy = Object.prototype.toString

// Map to for jumping from typeof(value) to associated type prefix used
// as a hash in the map of builtin implementations.
var types = { "function": "Object", "object": "Object" }

// Array is used to save method implementations for the host objects in order
// to avoid extending them with non-primitive values that could cause leaks.
var host = []
// Hash map is used to save method implementations for builtin types in order
// to avoid extending their prototypes. This also allows to share method
// implementations for types across diff contexts / frames / compartments.
var builtin = {}

function Primitive() {}
function ObjectType() {}
ObjectType.prototype = new Primitive()
function ErrorType() {}
ErrorType.prototype = new ObjectType()

var Default = builtin.Default = Primitive.prototype
var Null = builtin.Null = new Primitive()
var Void = builtin.Void = new Primitive()
builtin.String = new Primitive()
builtin.Number = new Primitive()
builtin.Boolean = new Primitive()

builtin.Object = ObjectType.prototype
builtin.Error = ErrorType.prototype

builtin.EvalError = new ErrorType()
builtin.InternalError = new ErrorType()
builtin.RangeError = new ErrorType()
builtin.ReferenceError = new ErrorType()
builtin.StopIteration = new ErrorType()
builtin.SyntaxError = new ErrorType()
builtin.TypeError = new ErrorType()
builtin.URIError = new ErrorType()


function Method(hint) {
  /**
  Private Method is a callable private name that dispatches on the first
  arguments same named Method:

      method(object, ...rest) => object[method](...rest)

  Optionally hint string may be provided that will be used in generated names
  to ease debugging.

  ## Example

      var foo = Method()

      // Implementation for any types
      foo.define(function(value, arg1, arg2) {
        // ...
      })

      // Implementation for a specific type
      foo.define(BarType, function(bar, arg1, arg2) {
        // ...
      })
  **/

  // Create an internal unique name if `hint` is provided it is used to
  // prefix name to ease debugging.
  var name = (hint || "") + "#" + Math.random().toString(32).substr(2)

  function dispatch(value) {
    // Method dispatches on type of the first argument.
    // If first argument is `null` or `void` associated implementation is
    // looked up in the `builtin` hash where implementations for built-ins
    // are stored.
    var type = null
    var method = value === null ? Null[name] :
                 value === void(0) ? Void[name] :
                 // Otherwise attempt to use method with a generated private
                 // `name` that is supposedly in the prototype chain of the
                 // `target`.
                 value[name] ||
                 // Otherwise assume it's one of the built-in type instances,
                 // in which case implementation is stored in a `builtin` hash.
                 // Attempt to find a implementation for the given built-in
                 // via constructor name and method name.
                 ((type = builtin[(value.constructor || "").name]) &&
                  type[name]) ||
                 // Otherwise assume it's a host object. For host objects
                 // actual method implementations are stored in the `host`
                 // array and only index for the implementation is stored
                 // in the host object's prototype chain. This avoids memory
                 // leaks that otherwise could happen when saving JS objects
                 // on host object.
                 host[value["!" + name]] ||
                 // Otherwise attempt to lookup implementation for builtins by
                 // a type of the value. This basically makes sure that all
                 // non primitive values will delegate to an `Object`.
                 ((type = builtin[types[typeof(value)]]) && type[name])


    // If method implementation for the type is still not found then
    // just fallback for default implementation.
    method = method || Default[name]


    // If implementation is still not found (which also means there is no
    // default) just throw an error with a descriptive message.
    if (!method) throw TypeError("Type does not implements method: " + name)

    // If implementation was found then just delegate.
    return method.apply(method, arguments)
  }

  // Make `toString` of the dispatch return a private name, this enables
  // method definition without sugar:
  //
  //    var method = Method()
  //    object[method] = function() { /***/ }
  dispatch.toString = function toString() { return name }

  // Copy utility methods for convenient API.
  dispatch.implement = implementMethod
  dispatch.define = defineMethod

  return dispatch
}

// Create method shortcuts form functions.
var defineMethod = function defineMethod(Type, lambda) {
  return define(this, Type, lambda)
}
var implementMethod = function implementMethod(object, lambda) {
  return implement(this, object, lambda)
}

// Define `implement` and `define` polymorphic methods to allow definitions
// and implementations through them.
var implement = Method("implement")
var define = Method("define")


function _implement(method, object, lambda) {
  /**
  Implements `Method` for the given `object` with a provided `implementation`.
  Calling `Method` with `object` as a first argument will dispatch on provided
  implementation.
  **/
  return defineProperty(object, method.toString(), {
    enumerable: false,
    configurable: false,
    writable: false,
    value: lambda
  })
}

function _define(method, Type, lambda) {
  /**
  Defines `Method` for the given `Type` with a provided `implementation`.
  Calling `Method` with a first argument of this `Type` will dispatch on
  provided `implementation`. If `Type` is a `Method` default implementation
  is defined. If `Type` is a `null` or `undefined` `Method` is implemented
  for that value type.
  **/

  // Attempt to guess a type via `Object.prototype.toString.call` hack.
  var type = Type && typefy.call(Type.prototype)

  // If only two arguments are passed then `Type` is actually an implementation
  // for a default type.
  if (!lambda) Default[method] = Type
  // If `Type` is `null` or `void` store implementation accordingly.
  else if (Type === null) Null[method] = lambda
  else if (Type === void(0)) Void[method] = lambda
  // If `type` hack indicates built-in type and type has a name us it to
  // store a implementation into associated hash. If hash for this type does
  // not exists yet create one.
  else if (type !== "[object Object]" && Type.name) {
    var Bulitin = builtin[Type.name] || (builtin[Type.name] = new ObjectType())
    Bulitin[method] = lambda
  }
  // If `type` hack indicates an object, that may be either object or any
  // JS defined "Class". If name of the constructor is `Object`, assume it's
  // built-in `Object` and store implementation accordingly.
  else if (Type.name === "Object")
    builtin.Object[method] = lambda
  // Host objects are pain!!! Every browser does some crazy stuff for them
  // So far all browser seem to not implement `call` method for host object
  // constructors. If that is a case here, assume it's a host object and
  // store implementation in a `host` array and store `index` in the array
  // in a `Type.prototype` itself. This avoids memory leaks that could be
  // caused by storing JS objects on a host objects.
  else if (Type.call === void(0)) {
    var index = host.indexOf(lambda)
    if (index < 0) index = host.push(lambda) - 1
    // Prefix private name with `!` so it can be dispatched from the method
    // without type checks.
    implement("!" + method, Type.prototype, index)
  }
  // If Got that far `Type` is user defined JS `Class`. Define private name
  // as hidden property on it's prototype.
  else
    implement(method, Type.prototype, lambda)
}

// And provided implementations for a polymorphic equivalents.
_define(define, _define)
_define(implement, _implement)

// Define exports on `Method` as it's only thing being exported.
Method.implement = implement
Method.define = define
Method.Method = Method
Method.method = Method
Method.builtin = builtin
Method.host = host

module.exports = Method

});

require.define("/node_modules/reducible/is-reduced.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var reduced = require("./reduced")

function isReduced(value) {
  return value && value.is === reduced
}

module.exports = isReduced

});

require.define("/node_modules/reducible/reduced.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";


// Exported function can be used for boxing values. This boxing indicates
// that consumer of sequence has finished consuming it, there for new values
// should not be no longer pushed.
function reduced(value) {
  /**
  Boxes given value and indicates to a source that it's already reduced and
  no new values should be supplied
  **/
  return { value: value, is: reduced }
}

module.exports = reduced

});

require.define("/node_modules/reducible/is-error.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var stringifier = Object.prototype.toString

function isError(value) {
  return stringifier.call(value) === "[object Error]"
}

module.exports = isError

});

require.define("/node_modules/reducible/end.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

module.exports = String("End of the collection")

});

require.define("/node_modules/reducible/reducible.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var reduce = require("./reduce")
var end = require("./end")
var isError = require("./is-error")
var isReduced = require("./is-reduced")
var reduced = require("./reduced")

function Reducible(reduce) {
  /**
  Reducible is a type of the data-structure that represents something
  that can be reduced. Most of the time it's used to represent transformation
  over other reducible by capturing it in a lexical scope.

  Reducible has an attribute `reduce` pointing to a function that does
  reduction.
  **/

  // JS engines optimize access to properties that are set in the constructor's
  // so we set it here.
  this.reduce = reduce
}

// Implementation of `accumulate` for reducible, which just delegates to it's
// `reduce` attribute.
reduce.define(Reducible, function reduceReducible(reducible, next, initial) {
  var result
  // State is intentionally accumulated in the outer variable, that way no
  // matter if consumer is broken and passes in wrong accumulated state back
  // this reducible will still accumulate result as intended.
  var state = initial
  try {
    reducible.reduce(function forward(value) {
      try {
        // If reduction has already being completed return is set to
        // an accumulated state boxed via `reduced`. It's set to state
        // that is return to signal input that reduction is complete.
        if (result) state = result
        // if dispatched `value` is is special `end` of input one or an error
        // just forward to reducer and store last state boxed as `reduced` into
        // state. Later it will be assigned to result and returned to input
        // to indicate end of reduction.
        else if (value === end || isError(value)) {
          next(value, state)
          state = reduced(state)
        }
        // if non of above just accumulate new state by passing value and
        // previously accumulate state to reducer.
        else state = next(value, state)

        // If state is boxed with `reduced` then accumulation is complete.
        // Indicated explicitly by a reducer or by end / error of the input.
        // Either way store it to the result in case broken input attempts to
        // call forward again.
        if (isReduced(state)) result = state

        // return accumulated state back either way.
        return state
      }
      // If error is thrown then forward it to the reducer such that consumer
      // can apply recovery logic. Also store current `state` boxed with
      // `reduced` to signal input that reduction is complete.
      catch (error) {
        next(error, state)
        result = reduced(state)
        return result
      }
    })
  }
  // It could be that attempt to reduce underlaying reducible throws, if that
  // is the case still forward an `error` to a reducer and store reduced state
  // into result, in case process of reduction started before exception and
  // forward will still be called. Return result either way to signal
  // completion.
  catch(error) {
    next(error, state)
    result = reduced(state)
    return result
  }
})

function reducible(reduce) {
  return new Reducible(reduce)
}
reducible.type = Reducible

module.exports = reducible

});

require.define("/node_modules/reducers/map.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var reducer = require("./reducer")

var map = reducer(function map(f, next, value, result) {
  /**
  Returns transformed version of given `source` where each item of it
  is mapped using `f`.

  ## Example

  var data = [{ name: "foo" }, { name: "bar" }]
  var names = map(data, function(value) { return value.name })
  print(names) // => < "foo" "bar" >
  **/
  next(f(value), result)
})

module.exports = map

});

require.define("/node_modules/reducers/expand.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var merge = require("./merge")
var map = require("./map")

function expand(source, f) {
  /**
  Takes `source` sequence maps each item via `f` to a new sequence
  and then flattens them down into single form sequence. Note that
  returned sequence will have items ordered by time and not by index,
  if you wish opposite you need to force sequential order by wrapping
  `source` into `sequential` before passing it.

  ## Example

  var sequence = expand([ 1, 2, 3 ], function(x) {
    return [ x, x * x ]
  })
  print(sequence)   // => < 1 1 2 4 3 9 >

  **/
  return merge(map(source, f))
}

module.exports = expand

});

require.define("/node_modules/reducers/merge.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var reduce = require("reducible/reduce")
var reducible = require("reducible/reducible")
var end = require("reducible/end")
var isError = require("reducible/is-error")

function merge(source) {
  /**
  Merges given collection of collections to a collection with items of
  all nested collections. Note that items in the resulting collection
  are ordered by the time rather then index, in other words if item from
  the second nested collection is deliver earlier then the item
  from first nested collection it will in appear earlier in the resulting
  collection.

  print(merge([ [1, 2], [3, 4] ]))  // => < 1 2 3 4 >
  **/
  return reducible(function accumulateMerged(next, initial) {
    var state = initial
    var open = 1

    function forward(value) {
      if (value === end) {
        open = open - 1
        if (open === 0) return next(end)
      } else {
        state = next(value, state)
      }
      return state
    }


    reduce(source, function accumulateMergeSource(nested) {
      // If there is an error or end of `source` collection just pass it
      // to `forward` it will take care of detecting weather it's error
      // or `end`. In later case it will also figure out if it's `end` of
      // result to and act appropriately.
      if (nested === end) return forward(end)
      if (isError(nested)) return forward(nested)
      // If `nested` item is not end nor error just `accumulate` it via
      // `forward` that keeps track of all collections that are bing forwarded
      // to it.
      open = open + 1
      reduce(nested, forward, null)
    }, initial)
  })
}

module.exports = merge

});

require.define("/node_modules/reducers/concat.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var reducible = require("reducible/reducible")
var reduce = require("reducible/reduce")
var end = require("reducible/end")

var slicer = Array.prototype.slice

function append(left, right) {
  /**
  Returns sequences of items in the `left` sequence followed by the
  items in the `right` sequence.
  **/
  return reducible(function reduceConcatination(next, initial) {
    reduce(left, function reduceLeft(value, result) {
      return value === end ? reduce(right, next, result) :
             next(value, result)
    }, initial)
  })
}

function concat(left, right /*, ...rest*/) {
  /**
  Returns a sequence representing the concatenation of the elements in the
  supplied arguments, in the given order.

  print(concat([ 1 ], [ 2, 3 ], [ 4, 5, 6 ])) // => <stream 1 2 3 4 5 6 />

  **/
  switch (arguments.length) {
    case 1: return left
    case 2: return append(left, right)
    default: return slicer.call(arguments).reduce(append)
  }
}

module.exports = concat

});

require.define("/node_modules/reducers/fold.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var reduce = require("reducible/reduce")
var isError = require("reducible/is-error")
var isReduced = require("reducible/is-reduced")
var end = require("reducible/end")

var Eventual = require("eventual/type")
var deliver = require("eventual/deliver")
var defer = require("eventual/defer")
var when = require("eventual/when")


// All eventual values are reduced same as the values they realize to.
reduce.define(Eventual, function reduceEventual(eventual, next, initial) {
  return when(eventual, function delivered(value) {
    return reduce(value, next, initial)
  }, function failed(error) {
    next(error, initial)
    return error
  })
})


function fold(source, next, initial) {
  /**
  Fold is just like `reduce` with a difference that `next` reducer / folder
  function it takes has it's parameters reversed. One always needs `value`,
  but not always accumulated one. To avoid conflict with array `reduce` we
  have a `fold`.
  **/
  var promise = defer()
  reduce(source, function fold(value, state) {
    // If source is `end`-ed deliver accumulated `state`.
    if (value === end) return deliver(promise, state)
    // If is source has an error, deliver that.
    else if (isError(value)) return deliver(promise, value)

    // Accumulate new `state`
    try { state = next(value, state) }
    // If exception is thrown at accumulation deliver thrown error.
    catch (error) { return deliver(promise, error) }

    // If already reduced, then deliver.
    if (isReduced(state)) deliver(promise, state.value)

    return state
  }, initial)

  // Wrap in `when` in case `promise` is already delivered to return an
  // actual value.
  return when(promise)
}

module.exports = fold

});

require.define("/node_modules/reducers/node_modules/eventual/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./index.js"}
});

require.define("/node_modules/reducers/node_modules/eventual/type.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var watchers = require("watchables/watchers")
var watch = require("watchables/watch")
var await = require("pending/await")
var isPending = require("pending/is")
var deliver = require("./deliver")
var when = require("./when")

// Internal utility function returns true if given value is of error type,
// otherwise returns false.
var isError = (function() {
  var stringy = Object.prototype.toString
  var error = stringy.call(Error.prototype)
  return function isError(value) {
    return stringy.call(value) === error
  }
})()

// Internal utility, identity function. Returns whatever is given to it.
function identity(value) { return value }

// Internal utility, decorator function that wraps given function into
// try / catch and returns thrown exception in case when exception is
// thrown.
function attempt(f) {
  return function effort(value) {
    try { return f(value) }
    catch (error) { return error }
  }
}


// Define property names used by an `Eventual` type. Names are prefixed via
// `module.id` to avoid name conflicts.
var observers = "observers@" + module.id
var result = "value@" + module.id
var pending = "pending@" + module.id


function Eventual() {
  /**
  Data type representing eventual value, that can be observed and delivered.
  Type implements `watchable`, `pending` and `eventual` abstractions, where
  first two are defined in an external libraries.
  **/
  this[observers] = []
  this[result] = this
  this[pending] = true
}
// Expose property names via type static properties so that it's easier
// to refer to them while debugging.
Eventual.observers = observers
Eventual.result = result
Eventual.pending = pending

watchers.define(Eventual, function(value) {
  return value[observers]
})
// Eventual values considered to be pending until the are deliver by calling
// `deliver`. Internal `pending` property is used to identify weather value
// is being watched or not.
isPending.define(Eventual, function(value) {
  return value[pending]
})
// Eventual type implements await function of pending abstraction, to enable
// observation of value delivery.
await.define(Eventual, function(value, observer) {
  if (isPending(value)) watch(value, observer)
  else observer(value[result])
})

// Eventual implements `deliver` function of pending abstraction, to enable
// fulfillment of eventual values. Eventual value can be delivered only once,
// which will transition it from pending state to non-pending state. All
// further deliveries are ignored. It's also guaranteed that all the registered
// observers will be invoked in FIFO order.
deliver.define(Eventual, function(value, data) {
  // Ignore delivery if value is no longer pending, or if it's in a process of
  // delivery (in this case eventual[result] is set to value other than
  // eventual itself). Also ignore if data deliver is value itself.
  if (value !== data && isPending(value) && value[result] === value) {
    var count = 0
    var index = 0
    var delivering = true
    var observers = void(0)
    // Set eventual value result to passed data value that also marks value
    // as delivery in progress. This way all the `deliver` calls is side
    // effect to this will be ignored. Note: value should still remain pending
    // so that new observers could be registered instead of being called
    // immediately, otherwise it breaks FIFO order.
    value[result] = data
    while (delivering) {
      // If current batch of observers is exhausted, splice a new batch
      // and continue delivery. New batch is created only if new observers
      // are registered in side effect to this call of deliver.
      if (index === count) {
        observers = watchers(value).splice(0)
        count = observers.length
        index = 0
        // If new observers have not being registered mark value as no longer
        // pending and finish delivering.
        if (count === index) {
          value[pending] = false
          delivering = false
        }
      }
      // Register await handlers on given result, is it may be eventual /
      // pending itself. Delivering eventual will cause delivery of the
      // delivered eventual's delivery value, whenever that would be.
      else {
        await(data, observers[index])
        index = index + 1
      }
    }
  }
})

// Eventual implements `when` polymorphic function that is part of it's own
// abstraction. It takes `value` `onFulfill` & `onError` handlers. In return
// when returns eventual value, that is delivered return value of the handler
// that is invoked depending on the given values delivery. If deliver value
// is of error type error handler is invoked. If value is delivered with other
// non-pending value that is not of error type `onFulfill` handlers is invoked
// with it. If pending value is delivered then it's value will be delivered
// it's result whenever that would be. This will cause both value and error
// propagation.
when.define(Eventual, function(value, onRealize, onError) {
  // Create eventual value for a return value.
  var delivered = false
  var eventual = void(0)
  var result = void(0)
  // Wrap handlers into attempt decorator function, so that in case of
  // exception thrown error is returned causing error propagation. If handler
  // is missing identity function is used instead to propagate value / error.
  var realize = onRealize ? attempt(onRealize) : identity
  var error = onError ? attempt(onError) : identity
  // Wait for pending value to be delivered.
  await(value, function onDeliver(data) {
    // Once value is delivered invoke appropriate handler, and deliver it
    // to a resulting eventual value.
    result = isError(data) ? error(data)
                           : realize(data)

    // If outer function is already returned and has created eventual
    // for it's result deliver it. Otherwise (if await called observer
    // in same synchronously) mark result delivered.
    if (eventual) deliver(eventual, result)
    else delivered = true
  })

  // If result is delivered already return it, otherwise create eventual
  // value for the result and return that.
  return delivered ? result : (eventual = new Eventual())
})

module.exports = Eventual

});

require.define("/node_modules/reducers/node_modules/watchables/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./index.js"}
});

require.define("/node_modules/reducers/node_modules/watchables/watchers.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var method = require("method")

// Method is supposed to return array of watchers for the given
// value.
var watchers = method("watchers")
module.exports = watchers

});

require.define("/node_modules/reducers/node_modules/watchables/watch.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var method = require("method")
var watchers = require("./watchers")

var watch = method("watch")
watch.define(function(value, watcher) {
  // Registers a `value` `watcher`, unless it"s already registered.
  var registered = watchers(value)
  if (registered && registered.indexOf(watcher) < 0)
    registered.push(watcher)
  return value
})

module.exports = watch

});

require.define("/node_modules/reducers/node_modules/eventual/node_modules/pending/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./index.js"}
});

require.define("/node_modules/reducers/node_modules/eventual/node_modules/pending/await.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var method = require("method")

// Set's up a callback to be called once pending
// value is realized. All object by default are realized.
var await = method("await")
await.define(function(value, callback) { callback(value) })

module.exports = await

});

require.define("/node_modules/reducers/node_modules/eventual/node_modules/pending/is.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var method = require("method")

// Returns `true` if given `value` is pending, otherwise returns
// `false`. All types will return false unless type specific
// implementation is provided to do it otherwise.
var isPending = method("is-pending")

isPending.define(function() { return false })

module.exports = isPending

});

require.define("/node_modules/reducers/node_modules/eventual/deliver.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

// Anyone crating an eventual will likely need to realize it, requiring
// dependency on other package is complicated, not to mention that one
// can easily wind up with several copies that does not necessary play
// well with each other. Exposing this solves the issues.
module.exports = require("pending/deliver")

});

require.define("/node_modules/reducers/node_modules/eventual/node_modules/pending/deliver.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var method = require("method")
// Method delivers pending value.
var deliver = method("deliver")

module.exports = deliver

});

require.define("/node_modules/reducers/node_modules/eventual/when.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var method = require("method")
var when = method("when")

when.define(function(value, onRealize) {
  return typeof(onRealize) === "function" ? onRealize(value) : value
})
when.define(Error, function(error, onRealize, onError) {
  return typeof(onError) === "function" ? onError(error) : error
})

module.exports = when

});

require.define("/node_modules/reducers/node_modules/eventual/defer.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var Eventual = require("./type")
var defer = function defer() { return new Eventual() }

module.exports = defer

});

require.define("/node_modules/dom-reduce/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./index.js"}
});

require.define("/node_modules/dom-reduce/event.js",function(require,module,exports,__dirname,__filename,process,global){/* vim:set ts=2 sw=2 sts=2 expandtab */
/*jshint asi: true undef: true es5: true node: true browser: true devel: true
         forin: true latedef: false globalstrict: true */

"use strict";

var reducible = require("reducible/reducible")
var isReduced = require("reducible/is-reduced")

function open(target, type, options) {
  /**
  Capture events on a DOM element, converting them to a reducible channel.
  Returns a reducible channel.

  ## Example

      var allClicks = open(document.documentElement, "click")
      var clicksOnMyTarget = filter(allClicks, function (click) {
        return click.target === myTarget
      })
  **/
  var capture = options && options.capture || false
  return reducible(function reducDomEvents(next, result) {
    function handler(event) {
      result = next(event, result)
      //  When channel is marked as accumulated, remove event listener.
      if (isReduced(result)) {
        if (target.removeEventListener)
          target.removeEventListener(type, handler, capture)
        else
          target.detachEvent(type, handler, capture)
      }
    }
    if (target.addEventListener) target.addEventListener(type, handler, capture)
    else target.attachEvent("on" + type, handler)
  })
}

module.exports = open

});

require.define("/node_modules/reducers/debug/print.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var reduce = require("reducible/reduce")
var reducible = require("reducible/reducible")
var end = require("reducible/end")
var isError = require("reducible/is-error")

var PREFIX = "\u200B"
var OPEN = PREFIX + "< "
var CLOSE = PREFIX + ">\n"
var ERROR = PREFIX + "\u26A1 "
var DELIMITER = PREFIX + " "

var SPECIALS = [ OPEN, CLOSE, ERROR, DELIMITER ]

var write = (function() {
  if (typeof(process) !== "undefined" &&
      typeof(process.stdout) !== "undefined" &&
      typeof(process.stdout.write) === "function") {
    var inspect = require("util").inspect
    var slicer = Array.prototype.slice
    return function write() {
      var message = slicer.call(arguments).map(function($) {
        return SPECIALS.indexOf($) >= 0 ? $ : inspect($)
      }).join("")
      process.stdout.write(message)
    }
  } else {
    return console.log.bind(console)
  }
})()

function print(source) {
  var open = false
  reduce(source, function reducePrintSource(value) {
    if (!open) write(OPEN)
    open = true

    if (value === end) write(CLOSE)
    else if (isError(value)) write(ERROR, value, DELIMITER, CLOSE)
    else write(value, DELIMITER)
  })
}

module.exports = print

});

require.define("util",function(require,module,exports,__dirname,__filename,process,global){var events = require('events');

exports.isArray = isArray;
exports.isDate = function(obj){return Object.prototype.toString.call(obj) === '[object Date]'};
exports.isRegExp = function(obj){return Object.prototype.toString.call(obj) === '[object RegExp]'};


exports.print = function () {};
exports.puts = function () {};
exports.debug = function() {};

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (typeof f !== 'string') {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j': return JSON.stringify(args[i++]);
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (x === null || typeof x !== 'object') {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Boolean} showHidden Flag that shows hidden (not enumerable)
 *    properties of objects.
 * @param {Number} depth Depth in which to descend in object. Default is 2.
 * @param {Boolean} colors Flag to turn on ANSI escape codes to color the
 *    output. Default is false (no coloring).
 */
function inspect(obj, showHidden, depth, colors) {
  var ctx = {
    showHidden: showHidden,
    seen: [],
    stylize: colors ? stylizeWithColor : stylizeNoColor
  };
  return formatValue(ctx, obj, (typeof depth === 'undefined' ? 2 : depth));
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
var colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
var styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = styles[styleType];

  if (style) {
    return '\u001b[' + colors[style][0] + 'm' + str +
           '\u001b[' + colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (value && typeof value.inspect === 'function' &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    return String(value.inspect(recurseTimes));
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object_keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object_getOwnPropertyNames(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (typeof value === 'function') {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (typeof value === 'function') {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  switch (typeof value) {
    case 'undefined':
      return ctx.stylize('undefined', 'undefined');

    case 'string':
      var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                               .replace(/'/g, "\\'")
                                               .replace(/\\"/g, '"') + '\'';
      return ctx.stylize(simple, 'string');

    case 'number':
      return ctx.stylize('' + value, 'number');

    case 'boolean':
      return ctx.stylize('' + value, 'boolean');
  }
  // For some reason typeof null is "object", so special case here.
  if (value === null) {
    return ctx.stylize('null', 'null');
  }
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (Object.prototype.hasOwnProperty.call(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!visibleKeys.hasOwnProperty(key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (recurseTimes === null) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (typeof name === 'undefined') {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


function isArray(ar) {
  return ar instanceof Array ||
         Array.isArray(ar) ||
         (ar && ar !== Object.prototype && isArray(ar.__proto__));
}


function isRegExp(re) {
  return re instanceof RegExp ||
    (typeof re === 'object' && Object.prototype.toString.call(re) === '[object RegExp]');
}


function isDate(d) {
  if (d instanceof Date) return true;
  if (typeof d !== 'object') return false;
  var properties = Date.prototype && Object_getOwnPropertyNames(Date.prototype);
  var proto = d.__proto__ && Object_getOwnPropertyNames(d.__proto__);
  return JSON.stringify(proto) === JSON.stringify(properties);
}

function isError(e) {
  return typeof e === 'object' && objectToString(e) === '[object Error]';
}
exports.isError = isError;

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}

exports.log = function (msg) {};

exports.pump = null;

var Object_keys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) res.push(key);
    return res;
};

var Object_getOwnPropertyNames = Object.getOwnPropertyNames || function (obj) {
    var res = [];
    for (var key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) res.push(key);
    }
    return res;
};

var Object_create = Object.create || function (prototype, properties) {
    // from es5-shim
    var object;
    if (prototype === null) {
        object = { '__proto__' : null };
    }
    else {
        if (typeof prototype !== 'object') {
            throw new TypeError(
                'typeof prototype[' + (typeof prototype) + '] != \'object\''
            );
        }
        var Type = function () {};
        Type.prototype = prototype;
        object = new Type();
        object.__proto__ = prototype;
    }
    if (typeof properties !== 'undefined' && Object.defineProperties) {
        Object.defineProperties(object, properties);
    }
    return object;
};

exports.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object_create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
};

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (typeof f !== 'string') {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(exports.inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j': return JSON.stringify(args[i++]);
      default:
        return x;
    }
  });
  for(var x = args[i]; i < len; x = args[++i]){
    if (x === null || typeof x !== 'object') {
      str += ' ' + x;
    } else {
      str += ' ' + exports.inspect(x);
    }
  }
  return str;
};

});

require.define("events",function(require,module,exports,__dirname,__filename,process,global){if (!process.EventEmitter) process.EventEmitter = function () {};

var EventEmitter = exports.EventEmitter = process.EventEmitter;
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;
function indexOf (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (x === xs[i]) return i;
    }
    return -1;
}

// By default EventEmitters will print a warning if more than
// 10 listeners are added to it. This is a useful default which
// helps finding memory leaks.
//
// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
var defaultMaxListeners = 10;
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!this._events) this._events = {};
  this._events.maxListeners = n;
};


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {

    // Check for listener leak
    if (!this._events[type].warned) {
      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }

    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = indexOf(list, listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

});

require.define("/node_modules/zip-reduce/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./zip.js"}
});

require.define("/node_modules/zip-reduce/zip.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var accumulate = require("reducible/reduce")
var reduced = require("reducible/reduced")
var isReduced = require("reducible/is-reduced")
var isError = require("reducible/is-error")
var end = require("reducible/end")

var map = require("reducers/map")

var slicer = Array.prototype.slice

function makeAccumulator(side) {
  var other = side === "left" ? "right" : "left"
  return function accumulate(value, state) {
    var queue = state[side]
    var buffer = state[other]
    var dispatch = state.next
    // If consumer finished consumption, then notify stream.
    if (state.closed)  return state.result
    // If this is an end of this stream, close a queue to indicate
    // no other value will be queued.
    else if (value === end) {
      if (isReduced(state)) return state
      queue.closed = true
      // If queue is empty, dispatch end of stream.
      if (!queue.length) {
        dispatch(value, state.result)
        state.left = state.right = state.next = null
        state.closed = true
        state.result = reduced(result)
      }
    }
    else {
      queue.push(value)
      // If there is a buffered value on both streams shift and dispatch.
      if (buffer.length) {
        if (isError(buffer[0]))
          dispatch(buffer.shift(), state.result)
        else if (isError(queue[0]))
          dispatch(queue.shift(), state.result)

        if (buffer.length && queue.length) {
          var result = dispatch([
            state.left.shift(),
            state.right.shift()
          ], state.result)
          // If consumer is done consumption or if buffer is empty and closed
          // dispatch end, and mark stream ended to stop streams and queueing
          // values too.
          if (isReduced(result) || (buffer.closed && !buffer.length)) {
            // Dispatch end of stream and cleanup state attributes.
            dispatch(end, result)
            state.left = state.right = state.next = null
            state.closed = true
            state.result = reduced(result)
          } else {
            state.result = result
          }
        }
      }
    }
    return state
  }
}

var accumulateLeft = makeAccumulator("left")
var accumulateRight = makeAccumulator("right")

function Zip() {}
accumulate.define(Zip, function(zipped, next, start) {
  var state = { result: start, next: next, left: [], right: [] }
  accumulate(zipped.left, accumulateLeft, state)
  accumulate(zipped.right, accumulateRight, state)
})

function array(item) { return [item] }

function unite(value) {
  value[0].push(value[1])
  return value[0]
}

function concatzip(zipped, sequence) {
  return map(zip(zipped, sequence), unite)
}

function zip(left, right/*, ...rest*/) {
  switch (arguments.length) {
    case 1:
      return map(left, array)
    case 2:
      var value = new Zip()
      value.left = left
      value.right = right
      value.leftQueue = []
      value.rightQueue = []
      return value
    default:
      return slicer.call(arguments, 2).reduce(concatzip, zip(left, right))
  }
}

module.exports = zip

});

require.define("/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {}
});

require.define("/grep-reduce.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

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
});

require.define("/node_modules/pattern-exp/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./pattern-exp.js"}
});

require.define("/node_modules/pattern-exp/pattern-exp.js",function(require,module,exports,__dirname,__filename,process,global){/* vim:set ts=2 sw=2 sts=2 expandtab */
/*jshint asi: true undef: true es5: true node: true browser: true devel: true
         forin: true latedef: false globalstrict: true*/

"use strict";

var stirgifier = Object.prototype.toString
var ESCAPE_PATTERN = /[\.\?\*\+\^\$\|\(\)\{\[\]\\]/g

function escape(pattern) {
  /**
  Returns the `pattern` with all regexp meta characters in it backslashed.
  **/
  return String(pattern).replace(ESCAPE_PATTERN, '\\$&')
}
escape.pattern = ESCAPE_PATTERN

function Pattern(pattern, flags) {
  /**
  Function takes `pattern` string or regexp & optional flags string,
  which is just regexp flags and returns instance of `RegExp` by actually
  calling it. If pattern fails to compile it will escaped given pattern and
  compile it to regexp after.

  ## examples
 
  RegExp("[")          // => SyntaxError("unterminated character class")
  RegExp(/:/, "y")     // => TypeError("can't supply flags when ...")
  Pattern("[")          // => /\[/
  Pattern(/:/, "y")     // => /:/
  **/
  if (!pattern.exec) {
    try {
      pattern = RegExp(pattern, flags)
    } catch (exception) {
      if (exception instanceof SyntaxError)
        pattern = RegExp(escape(pattern), flags)
      else
        throw exception
    }
  }
  return pattern
}
Pattern.escape = escape

module.exports = Pattern

});

require.define("/match-score.js",function(require,module,exports,__dirname,__filename,process,global){/* vim:set ts=2 sw=2 sts=2 expandtab */
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
});

require.define("/node_modules/functional/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./index.js"}
});

require.define("/node_modules/functional/compose.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var slicer = Array.prototype.slice

module.exports = compose
function compose() {
  /**
  Returns the composition of a list of functions, where each function
  consumes the return value of the function that follows. In math
  terms, composing the functions `f()`, `g()`, and `h()` produces
  `f(g(h()))`.
  Usage:
  var greet = function(name) { return 'hi: ' + name }
  var exclaim = function(statement) { return statement + '!' }
  var welcome = compose(exclaim, greet)
  welcome('moe')
  // => 'hi: moe!'
  **/

  var lambdas = slicer.call(arguments)
  return function composed() {
    var params = slicer.call(arguments)
    var index = lambdas.length
    var result = [lambdas[--index].apply(this, params)]
    while (0 <= --index) result[0] = lambdas[index].apply(this, result)
    return result[0]
  }
}

});

require.define("/node_modules/functional/partial.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var slicer = Array.prototype.slice

module.exports = partial
function partial(lambda) {
  /**
  Function composes new function out of given `lambda` with rest of the
  arguments curried.

  ## Example

      function sum(x, y) { return x + y }
      var inc = partial(sum, 1)

      inc(5) // => 6
  **/
  var curried = slicer.call(arguments, 1)
  return function partial() {
    var params = slicer.call(arguments)
    params.unshift.apply(params, curried)
    return lambda.apply(this, params)
  }
}

});

require.define("/node_modules/oops/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./oops.js"}
});

require.define("/node_modules/oops/field.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var curry = require("functional/curry")

var field = curry(function(id, hash) {
  /**
  High order function that returns accessor function for the attribute
  with a given name. Resulting function will take an object and will return
  value associated with that field.
  **/
  return hash[id]
})

module.exports = field

});

require.define("/node_modules/functional/curry.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var slicer = Array.prototype.slice

module.exports = curry

function currier(lambda, arity, params) {
  return function curried() {
    /**
    Function either continues curring of the arguments or executes function
    if desired arguments have being collected. If function curried is variadic
    then execution without arguments will finish curring and trigger function.
    **/

    var input = slicer.call(arguments)
    // Function will be executed if curried function is variadic and this is
    // invoked without any arguments.
    var execute = Infinity === arity && input.length === 0 
    // Prepend all curried arguments to the given arguments.
    if (params) input.unshift.apply(input, params)
    // If all expected number of arguments has being collected, or if function
    // is variadic and no arguments have being passed invoke a curried function.
    return (input.length >= arity || execute) ? lambda.apply(this, input) :
           // Otherwise continue curried.
           currier(lambda, arity, input)
  }
}

function curry(lambda, arity) {
  /**
  Returns function with implicit currying, which will continue currying until
  expected number of argument is collected. Expected number of arguments is
  determined by `lambda.length` unless it's 0. In later case function will be
  assumed to be variadic and will be curried until invoked with `0` arguments.
  Optionally `arity` of curried arguments can be overridden via second `arity`
  argument.

  ## Examples

     var sum = curry(function(a, b) {
       return a + b
     })
     console.log(sum(2, 2)) // 4
     console.log(sum(2)(4)) // 6

     var sum = curry(function() {
       return Array.prototype.reduce.call(arguments, function(sum, number) {
         return sum + number
       }, 0)
     })
     console.log(sum(2, 2)()) // 4
     console.log(sum(2, 4, 5)(-3)(1)()) // 9
  **/

  return currier(lambda, arity || lambda.length)
}

});

require.define("/node_modules/oops/query.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var curry = require("functional/curry")

var query = curry(function query(path, target) {
  var names = path.split(".")
  var count = names.length
  var index = 0
  var result = target
  while (result && index < count) {
    result = result[names[index]]
    index = index + 1
  }
  return result
})

module.exports = query

});

require.define("/node_modules/transducer/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./index.js"}
});

require.define("/node_modules/transducer/drop-repeats.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var reductions = require("reducers/reductions")
var filter = require("reducers/filter")
var map = require("reducers/map")


var ITEM = 0
var EQUAL = 1

function dropRepeats(input, assert) {
  /**
  Takes reducible `input` and returns narrowed down version with sequential
  repeated values dropped. For example, if a given `input` contains items has
  following form `< 1 1 2 2 1 >` then result will have a form of `< 1 2 1 >` by
  dropping the values that are the same as the previous value. Function takes
  second optional argument `assert` that can be used to compare items. Items
  to which `assert` returns true will be dropped.

  ## Examples

      dropRepeats([1, 2, 2, 3, 4, 4, 4, 4, 5])
      // => < 1 2 3 4 5 >

      dropRepeats([1, "1", 2, "2", 2, 2, 3, 4, "4"])
      // => < 1 "1" 2 "2" 2 3 4 "4" >

      dropRepeats([1, "1", 2, "2", 2, 3, 4, "4"], function(a, b) {
        return a == b
      })
      // => < 1 2 3 4 >
  **/
  var states = reductions(input, function(state, item) {
    var equal = assert ? assert(state[ITEM], item) :
                item === state[ITEM]
    return [item, equal]
  }, [{}])
  var updates = filter(states, function(state) { return !state[EQUAL] })
  return map(updates, function(update) { return update[ITEM] })
}

module.exports = dropRepeats

});

require.define("/node_modules/reducers/reductions.js",function(require,module,exports,__dirname,__filename,process,global){"use strict";

var reduce = require("reducible/reduce")
var reducible = require("reducible/reducible")
var end = require("reducible/end")
var isError = require("reducible/is-error")

function reductions(source, f, initial) {
  /**
  Returns `reducible` collection of the intermediate values of the reduction
  (as per reduce) of `source` by `f`, starting with `initial` value.

  ## Example

  var numbers = reductions([1, 1, 1, 1], function(accumulated, value) {
    return accumulated + value
  }, 0)
  print(numbers) // => < 1 2 3 4 >
  **/
  return reducible(function reduceReductions(next, start) {
    var state = initial
    return reduce(source, function reduceReductionsSource(value, result) {
      if (value === end) return next(end, result)
      if (isError(value)) return next(value, result)
      state = f(state, value)
      return next(state, result)
    }, start)
  })
}

module.exports = reductions

});

require.define("/kicks.js",function(require,module,exports,__dirname,__filename,process,global){/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Convert a method func that uses a `this` context into a function that takes
// the context object as the first parameter.
function lambda(method) {
  return function (context) {
    var args = Array.prototype.slice.call(arguments, 1);
    return method.apply(context, args);
  };
}
exports.lambda = lambda;

// A lambda approach to `Array.prototype.slice`.
// Used in a lot of places for slicing the arguments object into a proper array.
var slice = lambda(Array.prototype.slice);
exports.slice = slice;

var reverse = lambda(Array.prototype.reverse);
exports.reverse = reverse;

var reduce = lambda(Array.prototype.reduce);
exports.reduce = reduce;

// "Fill" arguments out on a function. A bit like `bind` except it always binds
// the `this` context of the function to `null`, forcing it to be a lambda.
function fill(fn, args, context) {
  return Function.prototype.bind.apply(fn, [context].concat(slice(arguments)));
}
exports.fill = fill;

// Apply an array of arguments to a function.
// `this` context is optional, and you can skip it if you like.
function apply(fn, args, context) {
  return fn.apply(context, args);
}
exports.apply = apply;

// Compose multiple functions, returning a new function
function compose() {
  var lambdas = reverse(slice(arguments));
  return function() {
    return reduce(lambdas, function (lambda, args) {
      return [apply(lambda, args)];
    }, arguments);
  };
}
exports.compose = compose;

// Doesn't work properly. Write test plz.
function extend(obj) {
  return reduce(slice(arguments, 1), function (obj, objN) {
    return reduce(Object.keys(objN), function (obj, key) {
      obj[key] = objN[key];
      return obj;
    }, obj);
  }, obj);
}
exports.extend = extend;

});

require.define("/assets/apps.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = [
  {
    "id": "dialer.gaiamobile.org",
    "actions": [
      {
        "names": ["dial", "call"],
        "params": ["contact"],
        "caption": "Call %"
      }
    ]
  },
  {
    "id": "messages.gaiamobile.org",
    "actions": [
      {
        "names": ["sms", "mms", "msg", "txt", "text", "message"],
        "params": ["contact", "message"],
        "caption": "SMS %",
        "parameterized": true
      }
    ]
  },
  {
    "id": "music.gaiamobile.org",
    "actions": [
      {
        "names": ["play", "listen", "music"],
        "params": ["artist"],
        "caption": "Play %"
      }
    ]
  },
  {
    "id": "contacts.gaiamobile.org",
    "actions": [
      {
        "names": [""],
        "params": ["contact"],
        "caption": "%"
      }
    ]
  },
  {
    "id": "email.gaiamobile.org",
    "actions": [
      {
        "names": ["mail", "email", "send"],
        "params": ["contact"],
        "caption": "Email %"
      }
    ]
  },
  {
    "id": "facebook.com",
    "actions": [
      {
        "names": ["fb"],
        "params": ["contact"],
        "caption": "%"
      }
    ]
  }
]
;

});

require.define("/assets/contacts.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = [
  {
    "serialized":"Matt Helm",
    "name":"Matt Helm",
    "org":"",
    "tel":"(579) 177-2938",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Hal Ambler",
    "name":"Hal Ambler",
    "org":"",
    "tel":"(597) 877-6932",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Ali Imran",
    "name":"Ali Imran",
    "org":"",
    "tel":"(805) 625-2445",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Jane Blonde",
    "name":"Jane Blonde",
    "org":"",
    "tel":"(198) 828-5828",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Basil Argyros",
    "name":"Basil Argyros",
    "org":"",
    "tel":"(389) 412-5035",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Modesty Blaise",
    "name":"Modesty Blaise",
    "org":"",
    "tel":"(196) 764-8078",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Sir Alan Blunt",
    "name":"Sir Alan Blunt",
    "org":"",
    "tel":"(185) 281-7417",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"James Bond",
    "name":"James Bond",
    "org":"",
    "tel":"(596) 630-1354",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Felix Leiter",
    "name":"Felix Leiter",
    "org":"",
    "tel":"(821) 897-8009",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Nancy Drew",
    "name":"Nancy Drew",
    "org":"",
    "tel":"(948) 691-8816",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Sherlock Holmes",
    "name":"Sherlock Holmes",
    "org":"",
    "tel":"(195) 100-3534",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Jason Bourne",
    "name":"Jason Bourne",
    "org":"",
    "tel":"(968) 814-6975",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Tim Donohue",
    "name":"Tim Donohue",
    "org":"",
    "tel":"(601) 300-5092",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Sam Fisher",
    "name":"Sam Fisher",
    "org":"",
    "tel":"(866) 714-6084",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Stephen Metcalfe",
    "name":"Stephen Metcalfe",
    "org":"",
    "tel":"(590) 021-2511",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Jack Ryan",
    "name":"Jack Ryan",
    "org":"",
    "tel":"(371) 332-0309",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Nick Fury",
    "name":"Nick Fury",
    "org":"",
    "tel":"(909) 914-3192",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Ada Wong",
    "name":"Ada Wong",
    "org":"",
    "tel":"(748) 014-3944",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Jack Bauer",
    "name":"Jack Bauer",
    "org":"",
    "tel":"(562) 904-7370",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Sydney Bristow",
    "name":"Sydney Bristow",
    "org":"",
    "tel":"(326) 778-6931",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Ethan Hunt",
    "name":"Ethan Hunt",
    "org":"",
    "tel":"(999) 937-3942",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Wyman Ford",
    "name":"Wyman Ford",
    "org":"",
    "tel":"(826) 680-3347",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Nick Carter-Killmaster",
    "name":"Nick Carter-Killmaster",
    "org":"",
    "tel":"(873) 393-7359",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Johnny Fedora",
    "name":"Johnny Fedora",
    "org":"",
    "tel":"(998) 752-4420",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Tamara Knight",
    "name":"Tamara Knight",
    "org":"",
    "tel":"(606) 104-4478",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Mitch Rapp",
    "name":"Mitch Rapp",
    "org":"",
    "tel":"(849) 863-2988",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Michael Jagger",
    "name":"Michael Jagger",
    "org":"",
    "tel":"(116) 272-5564",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"George Smiley",
    "name":"George Smiley",
    "org":"",
    "tel":"(872) 049-8897",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Simon Templar",
    "name":"Simon Templar",
    "org":"",
    "tel":"(805) 687-8498",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Philip Quest",
    "name":"Philip Quest",
    "org":"",
    "tel":"(370) 084-4730",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Mortadelo Pi",
    "name":"Mortadelo Pi",
    "org":"",
    "tel":"(516) 018-7675",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Filemón Pi",
    "name":"Filemón Pi",
    "org":"",
    "tel":"(120) 593-9832",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  },
  {
    "serialized":"Maria Hill",
    "name":"Maria Hill",
    "org":"",
    "tel":"(546) 569-5749",
    "url":"",
    "adr":{
      "street_address":"",
      "locality":"",
      "region":"",
      "postal_code":"",
      "country_name":""
    },
    "note":""
  }
]
;

});

require.define("/assets/music.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = [
  {
    "artist":"The Album Leaf",
    "serialized":"The Album Leaf",
    "subtitle":"Artist / 29 songs / 3 albums"
  },
  {
    "artist":"Ali Farka Toure",
    "serialized":"Ali Farka Toure",
    "subtitle":"Artist / 27 songs / 3 albums"
  },
  {
    "artist":"Amiina",
    "serialized":"Amiina",
    "subtitle":"Artist / 15 songs / 3 albums"
  },
  {
    "artist":"Anni Rossi",
    "serialized":"Anni Rossi",
    "subtitle":"Artist / 21 songs / 2 albums"
  },
  {
    "artist":"Arcade Fire",
    "serialized":"Arcade Fire",
    "subtitle":"Artist / 22 songs / 3 albums"
  },
  {
    "artist":"Arthur & Yu",
    "serialized":"Arthur & Yu",
    "subtitle":"Artist / 18 songs / 3 albums"
  },
  {
    "artist":"Au",
    "serialized":"Au",
    "subtitle":"Artist / 20 songs / 2 albums"
  },
  {
    "artist":"Band of Horses",
    "serialized":"Band of Horses",
    "subtitle":"Artist / 28 songs / 3 albums"
  },
  {
    "artist":"Beirut",
    "serialized":"Beirut",
    "subtitle":"Artist / 7 songs / 2 albums"
  },
  {
    "artist":"Billie Holiday",
    "serialized":"Billie Holiday",
    "subtitle":"Artist / 25 songs / 4 albums"
  },
  {
    "artist":"Burial",
    "serialized":"Burial",
    "subtitle":"Artist / 14 songs / 2 albums"
  },
  {
    "artist":"Wilco",
    "serialized":"Wilco",
    "subtitle":"Artist / 30 songs / 3 albums"
  },
  {
    "artist":"Justice",
    "serialized":"Justice",
    "subtitle":"Artist / 8 songs / 1 album"
  },
  {
    "artist":"Bishop Allen",
    "serialized":"Bishop Allen",
    "subtitle":"Artist / 28 songs / 4 albums"
  },
  {
    "artist":"Sigur Ros",
    "serialized":"Sigur Ros",
    "subtitle":"Artist / 13 songs / 2 albums"
  },
  {
    "artist":"Bjork",
    "serialized":"Bjork",
    "subtitle":"Artist / 19 songs / 2 albums"
  },
  {
    "artist":"The Black Keys",
    "serialized":"The Black Keys",
    "subtitle":"Artist / 5 songs / 2 albums"
  },
  {
    "artist":"Bob Dylan",
    "serialized":"Bob Dylan",
    "subtitle":"Artist / 12 songs / 3 albums"
  },
  {
    "artist":"Bodies of Water",
    "serialized":"Bodies of Water",
    "subtitle":"Artist / 8 songs / 1 album"
  },
  {
    "artist":"Bon Iver",
    "serialized":"Bon Iver",
    "subtitle":"Artist / 28 songs / 4 albums"
  },
  {
    "artist":"Counting Crows",
    "serialized":"Counting Crows",
    "subtitle":"Artist / 22 songs / 2 albums"
  },
  {
    "artist":"Death Cab for Cutie",
    "serialized":"Death Cab for Cutie",
    "subtitle":"Artist / 22 songs / 3 albums"
  },
  {
    "artist":"Fleet Foxes",
    "serialized":"Fleet Foxes",
    "subtitle":"Artist / 21 songs / 3 albums"
  },
  {
    "artist":"Fleetwood Mac",
    "serialized":"Fleetwood Mac",
    "subtitle":"Artist / 15 songs / 3 albums"
  },
  {
    "artist":"The Innocence Mission",
    "serialized":"The Innocence Mission",
    "subtitle":"Artist / 8 songs / 1 album"
  }
]
;

});

require.define("/node_modules/browserify-server/other.js",function(require,module,exports,__dirname,__filename,process,global){process.env.NODE_ENV = 'undefined'

});
require("/node_modules/browserify-server/other.js");

require.define("/index.js",function(require,module,exports,__dirname,__filename,process,global){/* This Source Code Form is subject to the terms of the Mozilla Public
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
var nouns = expand(Object.keys(data), function(type) {
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

function searchWithNoun(terms) {
  // In this case we don't assume than any of the terms is a
  // verb so we create pattern for nouns from all the terms.
  var nounPattern = terms.join("[^\\s]* ");
  var matches = grep(nounPattern, nouns, query("noun.serialized"));
  return expand(matches, function(pair) {
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

// Continues signal representing search results for the entered query.
// special `SOQ` value is used at as delimiter to indicate results for
// new query. This can be used by writer to flush previous inputs and
// start writing now ones.

var results = expand(searchTerms, function(terms) {
  if (!terms.length || !terms[0]) return SOQ;

  var count = terms.length;
  var first = terms[0];
  var last = terms[count - 1];

  return concat(SOQ,
                searchWithVerb(terms),
                searchWithNoun(terms));
});

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

function renderActions(input, target, suggestionsEl) {
  fold(input, function(match, result) {
    var results = result.results;
    var suggestions = result.suggestions;

    // reset view (probably instead of removing it would be better to move
    // it down and dim a little to make it clear it's history and not a match.
    if (match === SOQ) {
      target.innerHTML = "";
      suggestionsEl.innerHTML = "";
      return { suggestions: [],
               results: [] };
    }

    var appClassname = escStringForClassname(match.app.id);
    var title = compileCaption(match.action, match.input);
    var trailingText = '';

    if(match.action.parameterized && match.trailingText) {
      trailingText = ' <span class="trailing">' + match.trailingText + '</span>';
    }

    var renderFunc = renderType[match.inputType] || renderType['default'];

    // Eventually, we need a better way to handle this stuff. Templating? Mustache? writer() from reflex?
    var view = createElementFromString(
      '<li class="action-match ' + appClassname + '">' +
        renderFunc(match.input, title, trailingText) +
        '</li>'
    );

    // TODO: We should do binary search instead, but we
    // can optimize this later.
    results.push(match.score);
    results.sort().reverse();
    var index = results.lastIndexOf(match.score);
    var prevous = target.children[index];
    target.insertBefore(view, prevous);

    try {

    // Show the top 2 nouns as auto-completion suggestions
    if(results[0] == match.score || results[1] == match.score) {
      var el = createElementFromString(
        '<li class="action-completion">' + 
          '<span class="title">' +
          match.input.serialized +
          '</span>' +
          '</li>'
      );
      el.noun = match.input.serialized;

      if(suggestions.length) {
        if(suggestions[0] < match.score) {
          if(suggestions.length > 1) {
            suggestionsEl.removeChild(suggestionsEl.children[1]);
            suggestions.pop();
          }

          suggestionsEl.insertBefore(el, suggestionsEl.children[0]);
          suggestions.unshift(match.score);
        }
        else if(suggestions[0] > match.score) {
          if(suggestions.length > 1) {
            suggestionsEl.removeChild(suggestionsEl.children[1]);
            suggestions.pop();
          }

          suggestionsEl.appendChild(el);
          suggestions.push(match.score);
        }
      }
      else {
        suggestionsEl.appendChild(el);
        suggestions.push(match.score);
      }
    }

    } catch(e) {
      console.log(e)
    }

    return result;
  }, { suggestions: [],
       results: [] });
}

document.getElementById('suggestions').addEventListener('click', function(e) {
  var target = e.target;

  if(target.tagName == 'SPAN') {
    target = target.parentNode;
  }

  var bar = document.getElementById('action-bar').value = target.noun;
});

renderActions(results, 
              document.getElementById('matches'),
              document.getElementById('suggestions'));

});
require("/index.js");
})();
