// let options = {
//   // Forex conversions
//   getForexData_oxr: true, // Mocked values will be uses if set to false
//   osx_app_id: "YOUR_OSX_APP_ID" // openexchangerates.org app id
// };

// var ca = require("../index.js")(options);
// ca.start(options);

//-----------------------------------------------------------------------------

let options = {
  // Forex conversions
  getForexData_oxr: false, // Mocked values will be uses if set to false
  osx_app_id: "YOUR_OSX_APP_ID" // openexchangerates.org app id
};

var ca = require("../index.js")(options);
ca.start(options);

// Print the calculated VWAMPP price of BTC after 5 minutes:
setTimeout(() => {
  let pricesInUSD = ca.pricesInUSD;
  let log = ca.log;

  log.info(`BTC price is: `, pricesInUSD["BTC"]);
}, 5 * 60 * 1000);
