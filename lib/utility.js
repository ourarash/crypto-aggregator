// var firebase = require('firebase-admin');
var defines = require("./defines");
const log = defines.log;

//-----------------------------------------------------------------------------
/**
 * Checks if the chain of
 * object[keys[0]][keys[1]]...[keys[keys.length-1]] is valid
 * @param {object} object
 * @param {...any} keys
 */
function validChain(object, ...keys) {
  if (!object) return false;
  return keys.reduce((a, b) => (a || {})[b], object) !== undefined;
}
//-----------------------------------------------------------------------------
/**
 * Creates the chain of object[keys[0]][keys[1]]...[keys[keys.length-1]]
 * @param {object} object
 * @param  {...any} keys
 */
function createChain(object, ...keys) {
  // console.log('keys: ', JSON.stringify(keys));
  if (!object) return false;
  if (!keys || !keys.length) {
    return;
  }

  if (!object[keys[0]]) {
    object[keys[0]] = {};
  }
  if (keys.length == 1) {
    return;
  }
  let key0 = keys.shift();
  return exports.createChain(object[key0], ...keys);
}
//-----------------------------------------------------------------------------
/**
 * Checks if object[keys[0]][keys[1]]...[keys[keys.length-1]] is valid
 * otherwise creates it
 * @param {*} object
 * @param  {...any} keys
 */
function validOrCreateChain(object, ...keys) {
  if (!exports.validChain(object, ...keys)) {
    exports.createChain(object, ...keys);
    return false;
  } else {
    return true;
  }
}
//-----------------------------------------------------------------------------
/**
 *
 * @param {object} obj
 */
function removeUndefinedFromObject(obj) {
  Object.keys(obj).forEach(key => {
    if (obj[key] && typeof obj[key] === "object")
      this.removeUndefinedFromObject(obj[key]);
    else if (obj[key] == null) {
      delete obj[key];
    }
  });
  return obj;
}
//-----------------------------------------------------------------------------
/**
 *
 * @param {number} time
 */
function sleep(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}
//-----------------------------------------------------------------------------
/**
 * Formats a number with its decimal points
 * @param {number} n
 * @param {number} decimalNumbers
 */
function formatNumber(n, decimalNumbers = 4) {
  let result =  parseFloat(n.toFixed(decimalNumbers));
  return result;
}
//-----------------------------------------------------------------------------
/**
 *
 * @param {string} input
 */
function makeSymbolFirebaseFriendly(input) {
  let symbol = input.replace("/", "_");
  symbol = symbol.replace(/\./g, "_dot_");
  symbol = symbol.replace(/\$/g, "_dollar_");
  symbol = symbol.replace(/#/g, "_hash_");

  return symbol;
}
//-----------------------------------------------------------------------------
/**
 *
 * @param {Array} array
 * @param {number} n
 * @param {object} options
 */
// Gets an array of arrays A are returns an array of Nth element of A
function projectOnNthElement(array, n, options = {}) {
  let nullValue = options.nullValue || 0;

  if (!array) {
    return array;
  }
  try {
    return array.map(e => {
      if (e[n] === undefined || e[n] === null) {
        return nullValue;
      }
      return e[n];
    });
  } catch (error) {
    log("Error: ".red, error);
  }
}
//-----------------------------------------------------------------------------
/**
 * Determines if a is withing percentage of b
 * @param {Number} a
 * @param {Number} b
 * @param {Number} percentage
 */
function isAWithinPercentageOfB(a, b, percentage = 10) {
  if (percentage > 100 || percentage < 0) {
    log(
      "Error: ".red,
      `percentage should be between 1 and 100, but it is : ${percentage}`
    );
    return false;
  }
  let result =
    a <= (1 + percentage / 100) * b && a >= (1 - percentage / 100) * b;
  return result;
}
//-----------------------------------------------------------------------------
/**
 * Determines if a is within n standard deviation of mean
 * @param {Number} a
 * @param {Number} mean
 * @param {Number} standard_deviation
 * @param {Number} n
 */
function isAWithingNStandardDeviationOfMean(
  a,
  mean,
  standard_deviation,
  n = 2
) {
  let result =
    a <= mean + n * standard_deviation && a >= mean - n * standard_deviation;
  return result;
}
//-----------------------------------------------------------------------------
/**
 * Formats a price number into a string
 * @param {Number} n
 * @returns {string}
 */
function formatPrice(n) {
  if (!n) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n < 1 ? 4 : 2
  }).format(n);
}
//-----------------------------------------------------------------------------
var exports = (module.exports = {
  validChain: validChain,
  createChain: createChain,
  validOrCreateChain: validOrCreateChain,
  removeUndefinedFromObject: removeUndefinedFromObject,
  sleep: sleep,
  formatNumber: formatNumber,
  makeSymbolFirebaseFriendly: makeSymbolFirebaseFriendly,
  isAWithinPercentageOfB: isAWithinPercentageOfB,
  isAWithingNStandardDeviationOfMean: isAWithingNStandardDeviationOfMean,
  formatPrice: formatPrice
});
