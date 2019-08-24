"use strict";
const ccxt = require("ccxt");
var moment = require("moment");
var momentDurationFormatSetup = require("moment-duration-format");
var ss = require("simple-statistics");

var _ = require("lodash");
var utility_functions = require("./utility");
var defines = require("./defines");
var Globals = defines.Globals;
var log;
let g_statusBarText = [];
let g_statusBarRows = [];
const clone = require("clone");
const { table, getBorderCharacters } = require("table");

var numeral = require("numeral");

var oxr = require("open-exchange-rates");
var fx = require("money");

const sleep = utility_functions.sleep;
require("ansicolor").nice;

//-----------------------------------------------------------------------------
/**
 * Gets the list of all cryptocurrencies on CoinGecko and their prices
 */
async function getAllPriceFullCoinGecko() {
  const CoinGecko = require("coingecko-api");
  const CoinGeckoClient = new CoinGecko();
  let coinList = await CoinGeckoClient.coins.list();
  if (coinList && coinList.success) {
    let markets = [];
    // let maxNumberOfCoins = coinList.data.length;
    let maxNumberOfCoins = 2000;
    for (let p = 0; p < maxNumberOfCoins / 250; p++) {
      let partialMarket = await CoinGeckoClient.coins.markets({
        per_page: 250,
        page: p,
        vs_currency: "usd"
      });
      if (partialMarket && partialMarket.success) {
        markets = markets.concat(partialMarket.data);
      }
    }
    let prices = {};
    markets.forEach(c => {
      let symbol = c.symbol.toUpperCase();

      // Fix coins with the same abbreviation
      switch (symbol) {
        case "BTG": {
          if (c.name == "Bitcoin Gold") {
          } else {
            symbol = "BTG*";
          }
          break;
        }

        case "KEY": {
          if (c.name == "Selfkey") {
          } else {
            symbol = "KEY*";
          }
          break;
        }
      }

      prices[symbol] = {};
      prices[symbol]["USD"] = {
        PRICE: Number(c.current_price),
        CHANGEPCT24HOUR: Number(c.price_change_percentage_24h),
        MKTCAP: Number(c.market_cap)
      };

      try {
        Globals.refCryptoPrice[symbol] = c;
      } catch (e) {
        log("Error: ", e);
      }
    });

    log.info("Successfully Updated CoinGecko prices!");
  }
}
//-----------------------------------------------------------------------------
// Price Aggregator Experiments
//-----------------------------------------------------------------------------
const e_commands = Object.freeze({ fetchTicker: 0x01, fetchOHLCV: 0x02 });

/**
 * Resets memory after each iteration
 */
function resetIteration() {
  Globals.tickers = {};
  Globals.prevPricesInUSD = clone(Globals.pricesInUSD);
  Globals.prevVolumeInUSD = clone(Globals.volumeInUSD);
}
//-----------------------------------------------------------------------------
/**
 * returns true of the currency is Fiat
 * @param {String} currency
 */
function isFiat(currency) {
  return defines.fiats.indexOf(currency) >= 0;
}

//-----------------------------------------------------------------------------
/**
 * Gets ticker or OHLCV for all pairs in options.exchangeName
 * @param {object} options
 * @param {string} options.exchangeName the name of the exchange
 * @param {e_commands} options.cmd command
 * @param {boolean} options.drawOhlcvChart draw text ohlcv chart in log file
 * @param {number} options.ohlcvPeriod period for ohlcv requests
 */
async function getExchangeData(options) {
  let exchangeName = options.exchangeName;
  let ohlcvPeriod = options.ohlcvPeriod || "1m";
  let drawOhlcvChart = options.drawOhlcvChart || false;
  let cmd = options.cmd || e_commands.fetchOHLCV | e_commands.fetchTicker;

  log.verbosity(2).info(`Starting ${exchangeName.blue}. cmd: ${cmd}`);

  let exchange;
  let promises = [];

  // Create the exchange object using ccxt
  try {
    exchange = new ccxt[exchangeName]({ enableRateLimit: true });
  } catch (error) {
    log
      .configure({ locate: true })
      .error(`exchangeName: ${exchangeName}`, error);
    return;
  }

  // Check if the exchange has the cmd api
  Object.keys(e_commands).forEach(availableCmd => {
    if (cmd & e_commands[availableCmd] && !exchange.has[availableCmd]) {
      log
        .configure({ locate: true })
        .error(`Exchange ${exchangeName.blue} doesn't have ${availableCmd}.`);
      return;
    } else {
      if (cmd & e_commands[availableCmd]) {
        log
          .verbosity(2)
          .info(`Exchange ${exchangeName.blue} has ${availableCmd}.`);
      }
    }
  });

  // Load all markets in this exchange
  let markets;
  try {
    markets = await exchange.loadMarkets();
  } catch (error) {
    log.configure({ locate: true }).error(error);
  }
  if (!markets) {
    log.error(`Exchange ${exchangeName.blue} didn't return valid markets.`);
    return;
  }

  let marketPairs = Object.values(markets);

  // Iterate all markets
  for (
    let i = 0, // counts all markets
      j = 0; // counts  valid markets
    i < marketPairs.length && Globals.options.enable;
    i++
  ) {
    let m = marketPairs[i];

    // bypass incactive, darkpool, etc
    if (
      m.darkpool ||
      m.active === false ||
      m.type === "future" ||
      m.type === "expired" ||
      m.type === "option"
    ) {
      log
        .verbosity(3)
        .info(
          `Bypassing ${m.symbol} on ${exchangeName.blue}: `,
          (m.type ? `type: ` + `${m.type}, `.yellow : ``) + `active:`,
          `${m.active}`.red,
          m.darkpool ? `, dark: ${m.darkpool}` : ``
        );
      continue;
    } else if (m.type) {
      // log
      //   .verbosity(4)
      //   .debug(
      //     `Not bypassing ${m.symbol} on ${exchangeName.blue}: t:${m.type}, a:${
      //       m.active
      //     }, d:${m.darkpool}`
      //   );
    }

    await sleep(
      exchange.rateLimit / Globals.options.ccxtExchangeRateLimitDivider
    );

    // Request the ticker
    if (cmd & e_commands.fetchTicker && Globals.options.enable) {
      let ticker;
      try {
        ticker = await exchange.fetchTicker(m.symbol);

        let nonFiats = [];
        if (!isFiat(m.base)) {
          nonFiats.push(m.base);
        }
        if (!isFiat(m.quote)) {
          nonFiats.push(m.quote);
        }

        // Iterate the non-fiat currencies in the pair
        for (let index = 0; index < nonFiats.length; index++) {
          const crypto = nonFiats[index];
          // Store the ticker and the market in
          // Globals.tickers[m.symbol][exchangeName]['pairs']
          // TODO: refactor this in a new function
          utility_functions.validOrCreateChain(
            Globals.tickers,
            crypto,
            exchangeName
          );

          if (!Globals.tickers[crypto][exchangeName]["pairs"]) {
            Globals.tickers[crypto][exchangeName]["pairs"] = [];
          }

          Globals.tickers[crypto][exchangeName]["pairs"].push({
            ticker: ticker,
            market: m
          });

          // Call the callback function
          try {
            if (Globals.options.discoveredOneTickerCallBack) {
              Globals.options.discoveredOneTickerCallBack({
                symbol: crypto,
                exchangeName: exchangeName,
                ticker: ticker,
                market: m
              });
            }
          } catch (error) {
            log.error(error);
          }
        }
        log
          .verbosity(3)
          .info(
            `Fetched`,
            `${exchangeName}`.blue.bright,
            `(${i})`.blue.bright,
            `: ${m.symbol.magenta.bright}`,
            `| ask: `.yellow.bright +
              (ticker.ask ? `${ticker.ask.toString()}` : `NA`),
            `| bid: `.yellow.bright +
              (ticker.bid ? `${ticker.bid.toString()}` : `NA`),
            `| close: `.yellow.bright +
              (ticker.close ? `${ticker.close.toString()}` : `NA`),
            `| last: `.yellow.bright +
              (ticker.last ? `${ticker.last.toString()}` : `NA`)
          );
      } catch (error) {
        log.error(
          `Error: exchangeName: ${exchangeName}, symbol: ${
            m.symbol
          }, exchange.rateLimit: ${exchange.rateLimit}`,
          error
        );
      }
    }

    // Request OHLCV
    if (cmd & e_commands.fetchOHLCV && Globals.options.enable) {
      await sleep(exchange.rateLimit);
      let ohlcv;
      try {
        try {
          ohlcv = await exchange.fetchOHLCV(m.symbol, ohlcvPeriod);
        } catch (error) {
          log.configure({ locate: true }).error(error);
          continue;
        }

        if (!ohlcv || ohlcv.length === 0) {
          log
            .configure({ locate: true })
            .error(
              `${exchangeName} `.blue.bright,
              `fetchOHLCV (${j})`.cyan,
              `: ${m.symbol.magenta.bright} ohlcv is invalid:`,
              JSON.stringify(ohlcv)
            );
          continue;
        }

        utility_functions.createChain(
          g_Globals.aggregatedOHLCV,
          m.symbol,
          exchangeName,
          ohlcvPeriod
        );
        g_Globals.aggregatedOHLCV[m.symbol][exchangeName][ohlcvPeriod] = ohlcv;

        utility_functions.createChain(
          Globals.g_progressFetchOHLCV,
          m.symbol,
          exchangeName,
          ohlcvPeriod
        );
        Globals.g_progressFetchOHLCV[m.symbol][exchangeName][ohlcvPeriod] =
          moment(ohlcv[ohlcv.length - 1][0]).format(`YYYY-MM-DD hh:mm:ss a`) +
          " " +
          `(${moment(ohlcv[ohlcv.length - 1][0]).format()})`;

        log.info(
          `${exchangeName} `.blue.bright,
          `fetchOHLCV (${j})`.cyan,
          `: ${m.symbol.magenta.bright} done.`
        );

        if (!ohlcv || ohlcv.length === 0) {
          log
            .configure({ locate: true })
            .error(
              `${exchangeName} `.blue.bright,
              `fetchOHLCV (${j})`.cyan,
              `: ${m.symbol.magenta.bright} didn't return valid value.`
            );
        } else {
          if (drawOhlcvChart) {
            log("Debug: ".yellow, `ohlcv length is: `, ohlcv.length);

            var asciichart = require("asciichart");
            // Use closing value
            let plotPrices = utility_functions.projectOnNthElement(ohlcv, 4);
            plotPrices.splice(80);

            let plotOptions = { height: 6 };

            if (!plotPrices || plotPrices.lengt === 0) {
              log
                .configure({ locate: true })
                .error(
                  `${exchangeName} `.blue.bright,
                  `fetchOHLCV (${j})`.cyan,
                  `: ${m.symbol.magenta.bright} plotPrices length is invalid: `,
                  `${plotPrices}`
                );
            } else {
              log(
                "Debug: ".yellow,
                `plotPrices length is: `,
                plotPrices.length
              );
              try {
                console.log(asciichart.plot(plotPrices, plotOptions));
              } catch (error) {
                log.configure({ locate: true }).error(error);
                log(
                  "Debug: ".yellow,
                  "plotPrices: ",
                  JSON.stringify(plotPrices)
                );

                log("Debug: ".yellow, "ohlcv: ", JSON.stringify(ohlcv));
              }
            }
          }
        }
      } catch (error) {
        log.configure({ locate: true }).error(error);
      }
    }
    j++;
  }

  if (promises.length > 0) {
    await Promise.all(promises);
  }
  log
    .verbosity(2)
    .info(`${exchangeName}`.blue, ` getExchangeData`.bright, ` done!`);
  log.verbosity(2)(
    "-----------------------------------------------------------------------------"
  );
}

//-----------------------------------------------------------------------------
function getAllExchangesWithFetchTicker(options) {
  let exchanges = options.exchanges || ccxt.exchanges;
  if (exchanges) {
    exchanges = exchanges.filter(e => {
      return Globals.excludeExchanges.indexOf(e) < 0;
    });

    let result = exchanges.filter(e => {
      // console.log('e: ', JSON.stringify(e));
      let exchange;
      try {
        exchange = new ccxt[e]({ enableRateLimit: true });
      } catch (error) {
        log.configure({ locate: true }).error(`exchange: ${e}`, error);
        return false;
      }
      // log(`fetchTicker: ${exchange.has.fetchTicker}, fetchOHLCV: ${
      //     exchange.has.fetchOHLCV}`)
      return exchange.has.fetchTicker && exchange.has.fetchOHLCV;
    });
    return result;
  }
}
//-----------------------------------------------------------------------------
/**
 * Uses Globals.tickers to calculate the prices based on their volumes
 */
function aggregatePrices() {
  for (let crypto in Globals.tickers) {
    /**
     * Captures aggregates values for this crypto among all exchanges
     */
    let aggregatedValueAmongAllExchanges = {
      baseVolume: 0,
      quoteVolume: 0,
      priceFromBaseVolume: 0,
      priceFromQuoteVolume: 0,
      percentage: 0,
      marketCap: 0,
      accBasePercentage: 0,
      accQuotePercentage: 0,

      basePercentages: [],
      tickerPrices: [],
      baseVolumes: [],
      quotePercentages: [],
      quoteVolumes: [],
      items: [],

      numberOfExchanges: 0,
      numberOfTickers: 0
    };

    // We iterate exchanges in two passes.
    // Pass1: Calculate the volume of the non-USD part of pairs with this crypto in all
    // exchanges
    // Pass2: Calculate volume weighted average price
    let passes = ["calculateVolume", "calculatePrice"];
    for (let pass of passes) {
      for (let exchange in Globals.tickers[crypto]) {
        if (exchange === "__AGGRGT__") {
          continue;
        }
        // Iterate all pairs in the exchange
        for (
          let index = 0;
          index < Globals.tickers[crypto][exchange]["pairs"].length;
          index++
        ) {
          let ticker = Globals.tickers[crypto][exchange]["pairs"][index].ticker;
          const marketObj =
            Globals.tickers[crypto][exchange]["pairs"][index].market;

          let tickerBaseVolume = ticker.baseVolume || 0;
          let tickerQuoteVolume = ticker.quoteVolume || 0;
          let tickerPrice = ticker.last || ticker.close || ticker.ask || 0;

          let base, quote;
          base = marketObj.base;
          quote = marketObj.quote;

          if (tickerPrice === 0) {
            log.warn(
              `Bypassing ${base}/${quote} on ${exchange} cause its price is 0. Ticker value is: `,
              JSON.stringify(ticker, null, 2)
            );
            continue;
          }
          // If base is not the same as crypto, we swap them and also correct
          // the tickerPrice
          if (base !== crypto) {
            if (quote === crypto) {
              [base, quote] = [quote, base];
              [tickerBaseVolume, tickerQuoteVolume] = [
                tickerQuoteVolume,
                tickerBaseVolume
              ];
              tickerPrice = 1 / tickerPrice;
            } else {
              log.warn(
                `Neither base, nor quote was equal to ${crypto}: ${base}/${quote} on ${exchange}. Ticker value is: `,
                JSON.stringify(ticker, null, 2)
              );
              continue;
            }
          }

          // If quote is not USD, calculate the price of quote in USD, then
          // recalculate the price of base
          // First check to see if quote is a crypto
          if (quote !== "USD" && Globals.pricesInUSD[quote] > 0) {
            let newTickerQuoteVolume =
              tickerQuoteVolume * Globals.pricesInUSD[quote];
            tickerQuoteVolume = newTickerQuoteVolume;
            let newTickerPrice = tickerPrice * Globals.pricesInUSD[quote];
            tickerPrice = newTickerPrice;
          } else if (quote !== "USD") {
            // If quote is a Fiat, we convert it to USD
            if (isFiat(quote)) {
              try {
                let coEff = convertForex(1, quote, `USD`);
                let newTickerQuoteVolume = tickerQuoteVolume * coEff;
                tickerQuoteVolume = newTickerQuoteVolume;
                let newTickerPrice = tickerPrice * coEff;
                tickerPrice = newTickerPrice;
              } catch (error) {
                log.error(error);
                continue;
              }
            } else {
              // If it's neigher Fiat nor a crypto whose price is in our database,
              // We should not include this pair in our calculation
              continue;
            }
          }

          warningIfPriceIsTooOff(crypto, tickerPrice, exchange, marketObj);
          let item = {
            base: base,
            quote: quote,
            exchange: exchange
          };

          switch (pass) {
            case "calculateVolume": {
              try {
                aggregatedValueAmongAllExchanges["base"] = base;
                aggregatedValueAmongAllExchanges["quote"] = "USD";
              } catch (error) {
                log.configure({ locate: true }).error(error);
              }

              aggregatedValueAmongAllExchanges.baseVolume += tickerBaseVolume;
              aggregatedValueAmongAllExchanges.quoteVolume += tickerQuoteVolume;
              aggregatedValueAmongAllExchanges.marketCap += tickerQuoteVolume;

              if (!isFinite(tickerPrice)) {
                info.error("Found infinit value!");
              }

              aggregatedValueAmongAllExchanges.tickerPrices.push(tickerPrice);

              aggregatedValueAmongAllExchanges.baseVolumes.push(
                tickerBaseVolume
              );
              aggregatedValueAmongAllExchanges.quoteVolumes.push(
                tickerQuoteVolume
              );
              item["tickerPrice"] = tickerPrice;
              item["tickerBaseVolume"] = tickerBaseVolume;
              item["tickerQuoteVolume"] = tickerQuoteVolume;

              break;
            }
            // In this pass we assume the total volume for each crypto (aggregatedValueAmongAllExchanges.baseVolume)
            //is already calculated in the previous pass
            case "calculatePrice": {
              let basePercentage = 0;
              let quotePercentage = 0;

              try {
                aggregatedValueAmongAllExchanges["base"] = base;
                aggregatedValueAmongAllExchanges["quote"] = "USD";
                // aggregatedValueAmongAllExchanges["market"] = marketObj;
              } catch (error) {
                log.configure({ locate: true }).error(error);
              }

              // Calculate the weight of each pair
              if (aggregatedValueAmongAllExchanges.baseVolume !== 0) {
                basePercentage =
                  tickerBaseVolume /
                  aggregatedValueAmongAllExchanges.baseVolume;
                aggregatedValueAmongAllExchanges.priceFromBaseVolume +=
                  tickerPrice * basePercentage;
                aggregatedValueAmongAllExchanges.accBasePercentage += basePercentage;

                aggregatedValueAmongAllExchanges.basePercentages.push(
                  basePercentage
                );

                item["basePercentage"] = basePercentage;
              }

              // Calculate the weight of each pair using quoteVolume
              if (aggregatedValueAmongAllExchanges.quoteVolume !== 0) {
                quotePercentage =
                  tickerQuoteVolume /
                  aggregatedValueAmongAllExchanges.quoteVolume;
                aggregatedValueAmongAllExchanges.priceFromQuoteVolume +=
                  tickerPrice * quotePercentage;
                aggregatedValueAmongAllExchanges.accQuotePercentage += quotePercentage;

                aggregatedValueAmongAllExchanges.quotePercentages.push(
                  quotePercentage
                );
                item["quotePercentage"] = quotePercentage;
              }

              aggregatedValueAmongAllExchanges.items.push(item);

              warningIfPriceIsTooOff(crypto, tickerPrice, exchange, marketObj);

              ticker["basePercentage"] = basePercentage;
              ticker["quotePercentage"] = quotePercentage;
              break;
            }
          }
        } // pair
        aggregatedValueAmongAllExchanges.numberOfExchanges++;
      } // exchange
      Globals.tickers[crypto]["__AGGRGT__"] = aggregatedValueAmongAllExchanges;
    } // pass

    let priceInUSD = 0;

    // At this point we have all the prices from different pairs in
    // aggregatedValueAmongAllExchanges.tickerPrices
    if (
      aggregatedValueAmongAllExchanges.tickerPrices &&
      aggregatedValueAmongAllExchanges.tickerPrices.length > 0
    ) {
      // Calculate mean and stddev on all prices
      let statistics = {
        stdev: ss.standardDeviation(
          aggregatedValueAmongAllExchanges.tickerPrices
        ),
        mean: ss.mean(aggregatedValueAmongAllExchanges.tickerPrices)
      };

      // We put the non-outliers inside these two arrays
      let prices = [];
      let volumes = [];

      for (let [
        i,
        price
      ] of aggregatedValueAmongAllExchanges.tickerPrices.entries()) {
        if (!price) {
          continue;
        }

        // Bypassing outliers
        if (Globals.options.bypassOutliers) {
          let isAWithingNStandardDeviationOfMean = utility_functions.isAWithingNStandardDeviationOfMean(
            price,
            statistics.mean,
            statistics.stdev,
            /*n=*/ Globals.options.outlierStandardDeviationDistanceFromMean
          );

          if (!isAWithingNStandardDeviationOfMean) {
            let delta =
              Globals.options.outlierStandardDeviationDistanceFromMean *
              statistics.stdev;
            let formatStdDev = utility_functions.formatNumber(
              statistics.stdev,
              2
            );
            if (isNaN(formatStdDev)) {
              log.debug("here!");
              log.debug("statistics.stdev: ", JSON.stringify(statistics.stdev));
            }
            log.info(
              `Bypassing: ` +
                `${crypto}`.red +
                ` on` +
                ` ${aggregatedValueAmongAllExchanges.items[i].exchange}`.blue +
                ` (${aggregatedValueAmongAllExchanges.items[i].base}/${
                  aggregatedValueAmongAllExchanges.items[i].quote
                })` +
                `: ${utility_functions.formatPrice(price)}`.red +
                `, not in ` +
                `[${utility_functions.formatNumber(statistics.mean - delta)}`
                  .yellow +
                ` , ${utility_functions.formatNumber(statistics.mean + delta)}]`
                  .yellow +
                `: ±${Globals.options.outlierStandardDeviationDistanceFromMean}`
                  .yellow +
                ` * stddev ` +
                `(${formatStdDev})`.yellow +
                `=` +
                ` ${utility_functions.formatNumber(delta)}`.yellow +
                ` from mean ` +
                `(${utility_functions.formatPrice(statistics.mean)})`.yellow +
                `. `
            );
            continue;
          }
        }

        prices.push(price);
        volumes.push(aggregatedValueAmongAllExchanges.baseVolumes[i]);
      }

      let volumeSum = _.sum(volumes);

      prices.forEach((price, i) => {
        priceInUSD += (volumes[i] / volumeSum) * price;
      });

      if (priceInUSD) {
        Globals.pricesInUSD[aggregatedValueAmongAllExchanges.base] = priceInUSD;

        Globals.volumeInUSD[aggregatedValueAmongAllExchanges.base] =
          aggregatedValueAmongAllExchanges.baseVolume *
          Globals.pricesInUSD[aggregatedValueAmongAllExchanges.base];
      }

      // Check and warn against reference price
      warningIfPriceIsTooOff(
        crypto,
        Globals.pricesInUSD[aggregatedValueAmongAllExchanges.base]
      );
    }
  }
}
//-----------------------------------------------------------------------------
/**
 * Calculates number of discovered tickers and exchanges for the given crypto
 * @param {string} crypto
 * @returns {object}
 */
function calculateNumberOfTickersAndExchanges(crypto) {
  let numberOfTickers = 0;
  let numberOfExchanges = 0;
  if (utility_functions.validChain(Globals.tickers, crypto)) {
    numberOfExchanges = Object.keys(Globals.tickers[crypto]).length;

    // Subtract 1 for __AGGRGT__
    Globals.tickers[crypto]["__AGGRGT__"][`numberOfExchanges`] =
      numberOfExchanges - 1;

    for (let exchange in Globals.tickers[crypto]) {
      if (exchange === "__AGGRGT__") {
        continue;
      }
      numberOfTickers += Globals.tickers[crypto][exchange]["pairs"].length;
    }

    Globals.tickers[crypto]["__AGGRGT__"][`numberOfTickers`] = numberOfTickers;
  }
  return {
    numberOfTickers: numberOfTickers,
    numberOfExchanges: numberOfExchanges
  };
}

//-----------------------------------------------------------------------------
/**
 * Generates a warning if our discovered price was too far off from
 * a reference like coinGeko
 * @param {string} crypto
 * @param {number} tickerPrice
 * @param {string} exchange
 * @param {object} market
 */
function warningIfPriceIsTooOff(crypto, tickerPrice, exchange, market) {
  if (
    utility_functions.validChain(Globals, "refCryptoPrice", crypto, "price_usd")
  ) {
    let cmcPrice =
      Globals.refCryptoPrice[crypto].price_usd ||
      Globals.refCryptoPrice[crypto].current_price; // coinGecko;
    if (!utility_functions.isAWithinPercentageOfB(tickerPrice, cmcPrice)) {
      let percentage = ((cmcPrice - tickerPrice) / cmcPrice) * 100;
      log.warn(
        `${exchange}:${
          market.symbol
        } price ${tickerPrice} for ${crypto} is ${percentage}% off: ${cmcPrice}`
      );
    }
  }
}
//-----------------------------------------------------------------------------
let g_printStatusCounter = 0;
/**
 * Updates the output status bar
 */
async function updateStatusBar() {
  let curTime = moment().valueOf();

  let averageIterationTime =
    (Globals.iterationEndTime - Globals.startTime) /
    (Globals.iterationNumber || 1);

  averageIterationTime =
    averageIterationTime < 0
      ? curTime - Globals.startTime
      : averageIterationTime;

  averageIterationTime = moment
    .duration(averageIterationTime)
    .format("h[h]:mm[m]:s[s]");
  let elapsedTime = moment
    .duration(curTime - Globals.startTime)
    .format("h[h]:mm[m]:s[s]");

  // let frames = log.getSpinners().point.frames;
  let frames1 = ["∙∙∙", "●∙∙", "∙●∙", "∙∙●", "●●●", "∙∙∙", "●●●"];
  let frames2 = ["∙∙∙", "∙∙●", "∙●∙", "●∙∙", "●●●", "∙∙∙", "●●●"];

  let frameNumber1 = g_printStatusCounter % frames1.length;
  let frameNumber2 = frameNumber1;
  g_printStatusCounter++;
  let spinner1 = frames1[frameNumber1].toString();
  let spinner2 = frames2[frameNumber2].toString();

  if (frameNumber1 < frames1.length - 1) {
    spinner1 = spinner1.green;
    spinner2 = spinner2.green;
  } else {
    spinner1 = spinner1.green.bright;
    spinner2 = spinner2.green.bright;
  }

  let statusBarText = Array(2);
  statusBarText[0] = `-----------------------------------------------------------------------------`;
  statusBarText[1] =
    spinner1 +
    ` Summary:` +
    ` | Iter: ${Globals.iterationNumber}` +
    ` | #Coins: ${Object.keys(Globals.pricesInUSD).length}` +
    ` | #Tickers: ${Globals.totalNumberOfTickers}` +
    ` | Time: ${elapsedTime}` +
    ` | Time/Iter: ${averageIterationTime} ` +
    spinner2;
  let filtered = g_statusBarText.filter(el => {
    return el != null;
  });

  filtered = statusBarText.concat(g_statusBarText);

  log.setStatusBarText(filtered);
}
//-----------------------------------------------------------------------------
/**
 * Prints the log output for one coin (k) as a string entry in data array
 * @param {String} k
 * @param {number} i
 * @param {Array} data
 */
function printOneKey(k, i, data) {
  let p = Globals.pricesInUSD[k];
  let prevP = Globals.prevPricesInUSD[k];
  let cmcPrice = -1;
  if (
    utility_functions.validChain(Globals, "refCryptoPrice", k, "price_usd") ||
    utility_functions.validChain(Globals, "refCryptoPrice", k, "current_price") // coinGecko
  ) {
    cmcPrice =
      Globals.refCryptoPrice[k].price_usd ||
      Globals.refCryptoPrice[k].current_price; // coinGecko;
  }

  let diff = cmcPrice > 0 ? Math.round(((cmcPrice - p) / cmcPrice) * 100) : -1;

  if (diff === NaN) {
    log.debug("Got NaN!");
  }
  let diffString = "";
  if (cmcPrice === -1 || cmcPrice === 0) {
    diffString = `N/A`.yellow;
  } else if (Math.abs(diff) > 5) {
    diffString = diff.toString();
    diffString += "%";
    diffString = diffString.red;
  } else {
    diffString = diff.toString();
    diffString += "%";
    diffString = diffString.green;
  }
  let price = utility_functions.formatPrice(p);
  let prevPrice = utility_functions.formatPrice(prevP);

  let cmcPriceFormatted =
    cmcPrice <= 0 ? "N/A".yellow : utility_functions.formatPrice(cmcPrice);

  calculateNumberOfTickersAndExchanges(k);
  let numberOfTickers = 0;
  let numberOfExchanges = 0;
  if (
    utility_functions.validChain(
      Globals.tickers[k],
      "__AGGRGT__",
      `numberOfTickers`
    )
  ) {
    numberOfTickers = Globals.tickers[k]["__AGGRGT__"][`numberOfTickers`];
    numberOfExchanges = Globals.tickers[k]["__AGGRGT__"][`numberOfExchanges`];
    Globals.totalNumberOfTickers += numberOfTickers;
  }

  let volume = numeral(Globals.volumeInUSD[k] || 0).format("0.00 a");
  let prevVolume = numeral(Globals.prevVolumeInUSD[k] || 0).format("0.00 a");

  let color = "white";

  if (Globals.options.coinsInStatusBar.indexOf(k) >= 0) {
    color = "cyan";

    g_statusBarRows.push([
      `${k}: ${price}`.yellow,
      `diff: ${diffString}`,
      `Vol: $${volume}`
    ]);

    let statusTableOptions = {
      columnDefault: {
        paddingLeft: 0,
        paddingRight: 1
      },
      /**
       * @typedef {function} drawHorizontalLine
       * @param {number} index
       * @param {number} size
       * @return {boolean}
       */
      drawHorizontalLine: (index, size) => {
        return true;
      }
    };

    let statusOutput = table(g_statusBarRows, statusTableOptions);
    let rowsFormat = statusOutput.split("\n");

    let i = 1;
    g_statusBarText = [];
    rowsFormat.forEach(r => {
      if (r != "") {
        // g_statusBarText[i++] = r;
        g_statusBarText.push(r);
      }
    });
  }

  data.push([
    `${i + 1}`, // Number
    `${k}`[color], // Symbol
    `${numberOfTickers}`, // Number of tickers
    `${numberOfExchanges}`, // Number of Exchanges
    price[color],
    `${cmcPriceFormatted}`,
    `${diffString}`,
    `${volume}`[color]
  ]);
}
//-----------------------------------------------------------------------------
/**
 * Prints the currently calculated prices
 */
async function printStatus(onlyStatusLine = false) {
  g_statusBarText = [];
  g_statusBarRows = [];
  let keys = Object.keys(Globals.pricesInUSD).sort();
  let data = [
    [`#`, `Symbol`, `# of`, `# of`, `Price`, `Coin Gecko`, `Diff`, `Volume`],
    [
      ``, // Number
      ``, // Symbol
      `Tickers`, // Number of tickers
      `Xchngs`, // Number of exchanges
      `  (USD)  `,
      `  (USD)  `,
      `  (%)  `,
      `  (USD)  ` // Volume
    ]
  ];
  if (Globals.options.printAllPrices) {
    log.info(`Iteration number: ${Globals.iterationNumber}`);
  }
  Globals.totalNumberOfTickers = 0;
  for (let i = 0; i < keys.length && Globals.options.enable; i++) {
    const k = keys[i];
    printOneKey(k, i, data);
  }
  let tableHorizontalLines = [1];
  let options = {
    /**
     * @typedef {function} drawHorizontalLine
     * @param {number} index
     * @param {number} size
     * @return {boolean}
     */
    drawHorizontalLine: (index, size) => {
      return tableHorizontalLines.indexOf(index) < 0;
    }
  };

  if (Globals.options.printAllPrices) {
    let output = table(data, options);
    log.configure({
      time: {
        yes: false
      }
    })(output);
  }
}
//-----------------------------------------------------------------------------
/**
 * Prints the banner in the output
 */
function printBanner() {
  let banner = `
  ██████╗██████╗ ██╗   ██╗██████╗ ████████╗ ██████╗                                   
  ██╔════╝██╔══██╗╚██╗ ██╔╝██╔══██╗╚══██╔══╝██╔═══██╗                                  
  ██║     ██████╔╝ ╚████╔╝ ██████╔╝   ██║   ██║   ██║                                  
  ██║     ██╔══██╗  ╚██╔╝  ██╔═══╝    ██║   ██║   ██║                                  
  ╚██████╗██║  ██║   ██║   ██║        ██║   ╚██████╔╝                                  
   ╚═════╝╚═╝  ╚═╝   ╚═╝   ╚═╝        ╚═╝    ╚═════╝                                   
                                                                                       
   █████╗  ██████╗  ██████╗ ██████╗ ███████╗ ██████╗  █████╗ ████████╗ ██████╗ ██████╗ 
  ██╔══██╗██╔════╝ ██╔════╝ ██╔══██╗██╔════╝██╔════╝ ██╔══██╗╚══██╔══╝██╔═══██╗██╔══██╗
  ███████║██║  ███╗██║  ███╗██████╔╝█████╗  ██║  ███╗███████║   ██║   ██║   ██║██████╔╝
  ██╔══██║██║   ██║██║   ██║██╔══██╗██╔══╝  ██║   ██║██╔══██║   ██║   ██║   ██║██╔══██╗
  ██║  ██║╚██████╔╝╚██████╔╝██║  ██║███████╗╚██████╔╝██║  ██║   ██║   ╚██████╔╝██║  ██║
  ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝
                                                                                       
`;

  log.configure({ time: { yes: false } })(
    "-----------------------------------------------------------------------------"
  );
  log("");

  log.configure({ time: { yes: false } })(banner.green);
  log.configure({ time: { yes: false } })(
    "-----------------------------------------------------------------------------"
  );
}
//-----------------------------------------------------------------------------
/**
 * Calculates the price of all coins found in given exchanges
 * @param {object} options
 * @param {number} options.parallelExchangeRequests Number of parallel exchange
 *     calls
 * @param {Array} options.exchanges array of exchange names
 */
async function calCulatePrices(options) {
  let promises = [];
  let parallelExchangeRequests = options.parallelExchangeRequests || 50;
  let exchanges = options.exchanges || Globals.trustedExchanges;

  // Force the limit on number of parallel exchanges
  for (
    let index = 0, limitCounter = 0;
    index < exchanges.length && Globals.options.enable;
    index++, limitCounter++
  ) {
    const e = exchanges[index];
    options["exchangeName"] = e;

    // Calculate the price for coins in this exchange
    promises.push(getExchangeData(options));
    if (limitCounter > parallelExchangeRequests && Globals.options.enable) {
      log.info(
        `Rate limiter: `.bright,
        `waiting for parallel requests to finish:`,
        ` index: ${index}, limitCounter:${limitCounter}`
      );
      await Promise.all(promises);
      log.info(
        `Rate limiter`.bright,
        ` index: ${index}, limitCounter:${limitCounter} done!`
      );
      promises = [];
      limitCounter = 0;
    }
  }
  await Promise.all(promises);
}
//-----------------------------------------------------------------------------
/**
 * Requests prices from openexchange.org
 */
async function getForexData_oxr() {
  log.info("Getting Forex values from OXR...");
  try {
    oxr.set({ app_id: Globals.options.osx_app_id });
    oxr.latest(() => {
      if (oxr.rates && !oxr.error) {
        // Apply exchange rates and base rate to `fx` library object:
        fx.rates = oxr.rates;
        fx.base = oxr.base;
        log.info(
          `Got Forex values. 1 USD is: `,
          fx(1)
            .from("USD")
            .to(`EUR`),
          ` EUR`
        );
      } else {
        let msg =
          "Wasn't able to use live data for converting forex, wrong App ID?";
        if (oxr.error) {
          msg += ` ${oxr.error}`;
        }
        log.error(msg);
        log.info("Falling back to mocked values for forex conversions.");
        Globals.fallBackToMockForexValues = true;
      }
    });
  } catch (error) {
    log.error("Error: ", error);
  }
}
//-----------------------------------------------------------------------------
/**
 * Converts forexValue of forexSymbol to USD
 * Example: 1 EUR to USD
 * @param {number} forexValue amount of the forex currency
 * @param {string} forexSymbol name of the forex currency
 */
function convertForex(forexValue, forexSymbolFrom, forexSymbolTo = `USD`) {
  function returnMockedValue(
    forexValue,
    forexSymbolFrom,
    forexSymbolTo = `USD`
  ) {
    // Use mocked values
    let mock_fx_rates = require("./mock_fx_rates.js");
    // TODO: Currently we assume we are converting to dollar only
    return forexValue / mock_fx_rates.rates[`${forexSymbolFrom}`];
  }

  if (!Globals.options.getForexData_oxr || Globals.fallBackToMockForexValues) {
    return returnMockedValue(forexValue, forexSymbolFrom, forexSymbolTo);
  }
  try {
    let result = fx(forexValue)
      .from(forexSymbolFrom)
      .to(forexSymbolTo);
    return result;
  } catch (error) {
    log.error(
      "Wasn't able to use live data for converting forex (Wrong API key?)"
    );
    log.info("Falling back to mocked values for forex conversions.");
    return returnMockedValue(forexValue, forexSymbolFrom, forexSymbolTo);
  }
}
//-----------------------------------------------------------------------------
/**
 *
 * @param {object} options
 * @param {number} options.maxNumberOfIterations
 * @param {boolean} options.loopForEver
 * @param {boolean} options.getCoinGeckoPrices
 * @param {boolean} options.getForexData_oxr
 */
async function main(options = {}) {
  Globals.startTime = moment().valueOf();

  if (options.printBanner) {
    printBanner();
  }

  Object.keys(options).forEach(e => {
    if (Object.keys(Globals.options).includes(e)) {
      Globals.options[e] = options[e];
      log.info(`Setting ${e} to ${options[e]}`);
    }
  });

  if (Globals.options.getCoinGeckoPrices) {
    getAllPriceFullCoinGecko();
  }
  if (Globals.options.getForexData_oxr) {
    getForexData_oxr();
  } else {
    log.warn(
      "getForexData_oxr is false. Mocked values will be used for forex exchange conversion."
    );
  }

  let exchanges = Globals.options.trustedExchanges;

  exchanges = exchanges.filter(e => {
    return Globals.options.excludeExchanges.indexOf(e) < 0;
  });

  let calCulatePricesOptions = {
    exchanges: exchanges,
    // exchangeName: 'coinbasepro',
    drawOhlcvChart: true,
    cmd: e_commands.fetchTicker
  };

  // log
  //   .verbosity(3)
  //   .debug(
  //     "calCulatePricesOptions: ",
  //     JSON.stringify(calCulatePricesOptions, null, 2)
  //   );
  log.info("Exchanges with fetchTicker: ", JSON.stringify(exchanges));

  // Iterval for calculating partial WVAP
  Globals.intervals.aggregatePriceInterval = setInterval(() => {
    if (Globals.options.enable) {
      aggregatePrices();
      if (Globals.options.bPrintStatus) {
        printStatus();
      }

      try {
        if (Globals.options.aggregatePricesCallBack) {
          Globals.options.aggregatePricesCallBack();
        }
      } catch (error) {
        log.error(error);
      }
    }
  }, Globals.options.aggregatePriceInterval_ms);

  // Interval for updating prices from CoinGecko (for comparison)
  Globals.intervals.coingGeckoUpdateInterval = setInterval(() => {
    if (Globals.options.enable) {
      getAllPriceFullCoinGecko();
    }
  }, Globals.options.coingGeckoUpdateInterval_ms);

  updateStatusBar();

  // Interval for updating the status bar output
  Globals.intervals.statusBarTextInterval = setInterval(() => {
    if (Globals.options.enable) {
      updateStatusBar();
    }
  }, Globals.options.statusBarTextInterval_ms);

  // Each iteration queries all pairs on all exchanges
  for (
    let counter = 1;
    Globals.options.loopForEver
      ? true
      : counter <= Globals.options.maxNumberOfIterations;
    counter++
  ) {
    if (!Globals.options.enable) {
      break;
    }
    try {
      let itStartTime = moment().valueOf();
      Globals.iterationNumber = counter;
      log(
        "-----------------------------------------------------------------------------"
      );
      log.info(`Starting Iteration ${counter}...`.bright.yellow);
      log(
        "-----------------------------------------------------------------------------"
      );
      await calCulatePrices(calCulatePricesOptions);
      let itEndtTime = moment().valueOf();
      Globals.iterationEndTime = itEndtTime;
      let itDuration = moment
        .duration(itEndtTime - itStartTime)
        .format("h:mm:ss");

      log.info(
        `Iteration ${counter} took: ${itEndtTime -
          itStartTime}ms (${itDuration}s)`.bright.yellow
      );

      try {
        if (Globals.options.iterationCallBack) {
          Globals.options.iterationCallBack();
        }
      } catch (error) {
        log.error(error);
      }

      resetIteration();
    } catch (error) {
      log.error(error);
    }
  }

  Object.keys(Globals.intervals).forEach(key => {
    clearInterval(Globals.intervals[key]);
  });
}
//-----------------------------------------------------------------------------

async function start(options) {
  Globals.options.enable = true;
  await main(options);
  log.statusBarTextPush("ALL DONE!");
  log.info(`ALL DONE!`);
}

function stop(options) {
  log.info("Stop signal received. Please wait...");
  log.statusBarTextPush("Stop signal received. Please wait...");
  Globals.options.enable = false;
}

function disableLog() {
  log = log.disable();
}

function enableLog() {
  log = log.enable();
}

module.exports = function(options = Globals.options) {
  log = require("log-with-statusbar")(options.logOptions);
  log = log.maxVerbosity(10);
  return {
    stop: stop,
    start: start,
    disableLog: disableLog,
    enableLog: enableLog,
    log: log,
    pricesInUSD: Globals.pricesInUSD
  };
};
