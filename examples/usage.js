let options = {
  // Forex conversions
  getForexData_oxr: true, // Mocked values will be uses if set to false
  osx_app_id: "YOUR_OSX_APP_ID", // openexchangerates.org app id
};

var ca = require("../index.js")(options);
ca.start(options);