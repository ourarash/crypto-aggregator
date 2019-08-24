var defines = require("./lib/defines");

module.exports = function(config = defines.Globals.options) {
  var ca = require("./lib/ca.js")(config);
  return ca;
};
