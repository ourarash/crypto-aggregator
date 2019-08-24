# crypto-aggregator
Continuously scans exchanges and calculates the volume-weighted average price of each cryptocurrency.

[![NPM](https://badge.fury.io/js/crypto-aggregator.svg)](https://www.npmjs.com/package/crypto-aggregator)
[![NPM Downloads][downloadst-image]][downloads-url]

[downloads-image]: https://img.shields.io/npm/dm/crypto-aggregator.svg
[downloadst-image]: https://img.shields.io/npm/dt/crypto-aggregator.svg
[downloads-url]: https://npmjs.org/package/crypto-aggregator

- [x] Based on [ccxt](https://github.com/ccxt/ccxt)
- [x] Supports more than 120 bitcoin/altcoin exchanges
- [x] Evaluates all pairs in the given exchanges and averages the price of each coin
- [x] Filters out outliers
- [x] Accepts API key from [https://openexchangerates.org/](openexchangerates.org/) to convert between foreign exchanges
- [x] Accepts callbacks for each time the price is updated

#Installation

```bash
npm install crypto-aggregator --save
```

# Screenshot

[examples/demo.js](examples/demo.js)
![Output example](https://raw.githubusercontent.com/ourarash/crypto-aggregator/master/screenshot.gif)

# Usage

## Simple
In its simplest form, it can run as:

```javascript
let options = {
  // Forex conversions
  getForexData_oxr: true, // Mocked values will be uses if set to false
  osx_app_id: "YOUR_OSX_APP_ID", // openexchangerates.org app id
};

var ca = require("../index.js")(options);
ca.start(options);
```

## Other options and default values
Below are other options and their default values:

```javascript
options: {
    loopForEver: true,
    maxNumberOfIterations: 10, // ignored if loopForEver == true

    printBanner: true,

    getCoinGeckoPrices: true, // Get CoinGecko prices as a reference to compare our prices (optional)

    // Forex conversions
    getForexData_oxr: false,  // Mocked values will be uses if set to false
    osx_app_id: "YOUR_OSX_APP_ID", // openexchangerates.org app id

    // control
    enable: true, // Used for start/stop

    // Outlier detection
    bypassOutliers: true, // Ignores outliers
    outlierStandardDeviationDistanceFromMean: 3, // distance from mean for an outlier in sigma

    aggregatePriceInterval_ms: 5000,  // Aggregate price rate
    coingGeckoUpdateInterval_ms: 100 * 1000,  // CoinGecko Refresh rate
    statusBarTextInterval_ms: 1000, // Status bar update refersh rate

    aggregatePricesCallBack: null, // Called whenever the partial WVAP is calculated
    iterationCallBack: null, // Calculated whenever all exchanges and pairs were queired at the end of one iteration
    discoveredOneTickerCallBack:null,  // Called whenever found a new pair on an exchange


    bPrintStatus: true, //Print the status bar
    printAllPrices: true, // Print a summary table in the log file
    coinsInStatusBar: ["BTC", "ETH"], // Coins to be shown in the summary status bar

    ccxtExchangeRateLimitDivider:1,  // Divides CCXT's recommended rateLimit time if filling adventerous!

    // Exchanges to query from
    trustedExchanges: [
      "huobipro",
      "kraken",
      "binance",
      "bittrex",
      "bitmex",
      "bitstamp",
      "coinbasepro",
      "gemini",
      "itbit",
      "bitflyer",
      "poloniex",
      "independentreserve",

      "liquid",
      "upbit"
    ],

    // Exchanges to exclude even if they are in trustedExchanges
    excludeExchanges: [
      "_1btcxe",
      "allcoin",
      "theocean",
      "xbtce",
      "cointiger",
      "bibox",
      "coolcoin",
      "uex",
      "dsx",
      "flowbtc",
      "bcex"
    ]
  }
```


# Logger

The logger used in this package is available separately in [log-with-statusbar](https://www.npmjs.com/package/log-with-statusbar) npm package

# License

Free to use under [ICS](https://opensource.org/licenses/ISC). Backlinks and credit are greatly appreciated!

# Issue and Pull Requests

Issues and pull requests are welcome.