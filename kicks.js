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
