let options = {
  // Forex conversions
  getForexData_oxr: false, // Mocked values will be uses if set to false
  osx_app_id: "YOUR_OSX_APP_ID", // openexchangerates.org app id

  iterationCallBack: iterationCallBack
};

var ca = require("../index.js")(options);
var log = ca.log;
ca.start(options);

/**
 * Called each time all pairs on all exchanges are dicovered
 */
function iterationCallBack() {
  let pricesInUSD = ca.pricesInUSD;
  // log.info("pricesInUSD: ", JSON.stringify(pricesInUSD));
}
