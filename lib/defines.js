const log = require("log-with-statusbar")({
  ololog_configure: {
    time: { yes: true, print: x => x.toLocaleString().bright.cyan + " " },
    locate: false,
    tag: true
  },
  initialStatusTextArray: ["Please wait..."],
  minVerbosity: 1, //Minimum verbosity level
  verbosity: 1, //Default verbosity level
  enableStatusBar: true
});

/**
 * Global variables
 */
Globals = {
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

    aggregatePriceInterval_ms: 5000,
    coingGeckoUpdateInterval_ms: 100 * 1000,
    statusBarTextInterval_ms: 1000,

    aggregatePricesCallBack: null, // Called whenever the partial WVAP is calculated
    iterationCallBack: null, // Calculated whenever all exchanges and pairs were queired at the end of one iteration
    discoveredOneTickerCallBack:null,  // Called whenever found a new pair on an exchange


    bPrintStatus: true,
    printAllPrices: true,
    coinsInStatusBar: ["BTC", "ETH"], // Coins to be shown in the summary status bar

    ccxtExchangeRateLimitDivider:1,  // Divides CCXT's recommended rateLimit time if filling adventerous!

    // Exchanges to query from
    trustedExchanges: [
      // "bitforex",
      // "bitfinex",

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
    // Exchanges to exclude the query from
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
  },
  fallBackToMockForexValues: false,

  startTime: 0,
  iterationEndTime: 0,
  iterationNumber: 0,
  coinGeckoCoinList: [],

  refCryptoPrice: {},
  generalMarketData: {},
  forex: {},
  intervals: {
    aggregatePriceInterval: null,
    coingGeckoUpdateInterval: null,
    statusBarTextInterval: null
  },
  logOptions: {
    ololog_configure: {
      time: { yes: true, print: x => x.toLocaleString().bright.cyan + " " },
      locate: false,
      tag: true
    },
    initialStatusTextArray: ["Please wait..."],
    minVerbosity: 1, //Minimum verbosity level
    verbosity: 1, //Default verbosity level
    enableStatusBar: true
  },

  /**
   * Captures all tickers from all exchanges for all pairs
   * tickers[cryptoName][exchangeName]['pairs'][index].ticker to USD
   *         g_tickers = {
   *           'BTC' : {
   *             'binance': {
   *               pairs: [{ticker: {...}, market: {symbol: 'BTC/USDT'}},
   *                       {ticker: {...}, market: {symbol: 'BTC/BNB'}}
   *                       ]
   *             },
   *             'kraken': {
   *               pairs: [{ticker: {...}, market: {symbol: 'ETH/BTC'}},
   *                       {ticker: {...}, market: {symbol: 'BTC/USDT'}},
   *                      ]
   *             }
   *           }
   *         }
   */
  tickers: {},
  totalNumberOfTickers: 0,
  aggregatedOHLCV: {},
  progressFetchOHLCV: {},
  pricesInUSD: {
    // USDT: 1.01,
  },

  volumeInUSD: {
    // USDT: 1.01,
  },

  prevPricesInUSD: {
    // USDT: 1.01,
  },

  prevVolumeInUSD: {
    // USDT: 1.01,
  }
};

let fiats = [
  "AED",
  "AFN",
  "ALL",
  "AMD",
  "ANG",
  "AOA",
  "ARS",
  "AUD",
  "AWG",
  "AZN",
  "BAM",
  "BBD",
  "BDT",
  "BGN",
  "BHD",
  "BIF",
  "BMD",
  "BND",
  "BOB",
  "BOV",
  "BRL",
  "BSD",
  "BTN",
  "BWP",
  "BYR",
  "BZD",
  "CAD",
  "CDF",
  "CHE",
  "CHF",
  "CHW",
  "CLF",
  "CLP",
  "CNY",
  "COP",
  "COU",
  "CRC",
  "CUC",
  "CUP",
  "CVE",
  "CZK",
  "DJF",
  "DKK",
  "DOP",
  "DZD",
  "EGP",
  "ERN",
  "ETB",
  "EUR",
  "FJD",
  "FKP",
  "GBP",
  "GEL",
  "GHS",
  "GIP",
  "GMD",
  "GNF",
  "GTQ",
  "GYD",
  "HKD",
  "HNL",
  "HRK",
  "HTG",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "IQD",
  "IRR",
  "ISK",
  "JMD",
  "JOD",
  "JPY",
  "KES",
  "KGS",
  "KHR",
  "KMF",
  "KPW",
  "KRW",
  "KWD",
  "KYD",
  "KZT",
  "LAK",
  "LBP",
  "LKR",
  "LRD",
  "LSL",
  "LTL",
  "LVL",
  "LYD",
  "MAD",
  "MDL",
  "MGA",
  "MKD",
  "MMK",
  "MNT",
  "MOP",
  "MRO",
  "MUR",
  "MVR",
  "MWK",
  "MXN",
  "MXV",
  "MYR",
  "MZN",
  "NAD",
  "NGN",
  "NIO",
  "NOK",
  "NPR",
  "NZD",
  "OMR",
  "PAB",
  "PEN",
  "PGK",
  "PHP",
  "PKR",
  "PLN",
  "PYG",
  "QAR",
  "RON",
  "RSD",
  "RUB",
  "RWF",
  "SAR",
  "SBD",
  "SCR",
  "SDG",
  "SEK",
  "SGD",
  "SHP",
  "SLL",
  "SOS",
  "SRD",
  "SSP",
  "STD",
  "SYP",
  "SZL",
  "THB",
  "TJS",
  "TMT",
  "TND",
  "TOP",
  "TRY",
  "TTD",
  "TWD",
  "TZS",
  "UAH",
  "UGX",
  "USD",
  "USN",
  "USS",
  "UYI",
  "UYU",
  "UZS",
  "VEF",
  "VND",
  "VUV",
  "WST",
  "XAF",
  "XAG",
  "XAU",
  "XBA",
  "XBB",
  "XBC",
  "XBD",
  "XCD",
  "XDR",
  "XFU",
  "XOF",
  "XPD",
  "XPF",
  "XPT",
  "XTS",
  "XXX",
  "YER",
  "ZAR",
  "ZMW"
];

var exports = (module.exports = {
  Globals: Globals,
  fiats: fiats,
  // options: options,
  log: log
});
