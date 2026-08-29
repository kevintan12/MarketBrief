// ── Market identity and session definitions ──────────────────────────────────
(function(root){
  var MarketBrief=root.MarketBrief=root.MarketBrief||{};

  var markets={
    US:{
      timezone:'America/New_York',
      open:'09:30',
      close:'16:00',
      symbolSuffixes:[],
      indexSymbols:[]
    },
    SG:{
      timezone:'Asia/Singapore',
      open:'09:00',
      close:'17:00',
      symbolSuffixes:['.SI'],
      indexSymbols:['^STI']
    },
    HK:{
      timezone:'Asia/Hong_Kong',
      open:'09:30',
      close:'16:00',
      symbolSuffixes:['.HK'],
      indexSymbols:['^HSI']
    }
  };

  function getMarketCodeForSymbol(symbol){
    var normalized=String(symbol||'').toUpperCase();
    if(markets.SG.symbolSuffixes.some(function(suffix){return normalized.endsWith(suffix);})||markets.SG.indexSymbols.indexOf(normalized)!==-1) return 'SG';
    if(markets.HK.symbolSuffixes.some(function(suffix){return normalized.endsWith(suffix);})||markets.HK.indexSymbols.indexOf(normalized)!==-1) return 'HK';
    return 'US';
  }

  function finiteNumber(value){
    return Number.isFinite(value)?value:null;
  }

  function normalizeQuote(raw,requestedSymbol){
    raw=raw&&typeof raw==='object'?raw:{};
    var provider=raw.provider&&typeof raw.provider==='object'?raw.provider:{};
    var symbol=String(requestedSymbol||raw.symbol||'').toUpperCase();
    var market=getMarketCodeForSymbol(symbol);
    var providerMarketState=typeof provider.marketState==='string'?provider.marketState.toUpperCase():null;
    var regularMarketPrice=finiteNumber(provider.regularMarketPrice);
    var previousClose=finiteNumber(provider.regularMarketPreviousClose);
    var preMarketPrice=finiteNumber(provider.preMarketPrice);
    var postMarketPrice=finiteNumber(provider.postMarketPrice);
    var displayPrice=null;
    var displayPriceSession=null;
    var referencePrice=null;
    var providerTimestamp=null;
    var providerTimestampSource=null;
    var status='invalid';

    if(providerMarketState==='REGULAR'&&regularMarketPrice!==null){
      displayPrice=regularMarketPrice;
      displayPriceSession='regular';
      referencePrice=previousClose;
      providerTimestamp=finiteNumber(provider.regularMarketTime);
      providerTimestampSource=providerTimestamp===null?null:'regularMarketTime';
      status='ok';
    } else if(providerMarketState==='PRE'){
      if(market==='US'&&preMarketPrice!==null){
        displayPrice=preMarketPrice;
        displayPriceSession='pre';
        referencePrice=previousClose;
        providerTimestamp=finiteNumber(provider.preMarketTime);
        providerTimestampSource=providerTimestamp===null?null:'preMarketTime';
        status='ok';
      } else if(regularMarketPrice!==null){
        displayPrice=regularMarketPrice;
        displayPriceSession='regularClose';
        referencePrice=previousClose;
        providerTimestamp=finiteNumber(provider.regularMarketTime);
        providerTimestampSource=providerTimestamp===null?null:'regularMarketTime';
        status='ok';
      }
    } else if(providerMarketState==='POST'){
      if(market==='US'&&postMarketPrice!==null){
        displayPrice=postMarketPrice;
        displayPriceSession='post';
        referencePrice=regularMarketPrice;
        providerTimestamp=finiteNumber(provider.postMarketTime);
        providerTimestampSource=providerTimestamp===null?null:'postMarketTime';
        status='ok';
      } else if(regularMarketPrice!==null){
        displayPrice=regularMarketPrice;
        displayPriceSession='regularClose';
        referencePrice=previousClose;
        providerTimestamp=finiteNumber(provider.regularMarketTime);
        providerTimestampSource=providerTimestamp===null?null:'regularMarketTime';
        status='ok';
      }
    } else if(providerMarketState==='CLOSED'&&regularMarketPrice!==null){
      displayPrice=regularMarketPrice;
      displayPriceSession='regularClose';
      referencePrice=previousClose;
      providerTimestamp=finiteNumber(provider.regularMarketTime);
      providerTimestampSource=providerTimestamp===null?null:'regularMarketTime';
      status='ok';
    } else if(providerMarketState!=='REGULAR'&&regularMarketPrice!==null){
      displayPrice=regularMarketPrice;
      displayPriceSession='unknown';
      referencePrice=previousClose;
      providerTimestamp=finiteNumber(provider.regularMarketTime);
      providerTimestampSource=providerTimestamp===null?null:'regularMarketTime';
      status='ok';
    }

    if(displayPrice===null&&finiteNumber(raw.price)!==null){
      displayPrice=finiteNumber(raw.price);
      displayPriceSession='unknown';
      referencePrice=previousClose;
      if(raw.priceSource==='latestDailyClose'){
        providerTimestamp=finiteNumber(provider.latestChartTimestamp);
        providerTimestampSource=providerTimestamp===null?null:'latestChartTimestamp';
      }
      status='fallback';
    }

    var change=null;
    var percentChange=null;
    if(displayPrice!==null&&referencePrice!==null){
      change=displayPrice-referencePrice;
      percentChange=referencePrice!==0?change/referencePrice*100:null;
    }

    return {
      symbol:symbol,
      name:raw.name||symbol,
      market:market,
      exchange:provider.fullExchangeName||provider.exchangeName||provider.exchange||null,
      currency:raw.currency||null,
      quoteType:provider.quoteType||provider.instrumentType||null,
      regularMarketPrice:regularMarketPrice,
      previousClose:previousClose,
      displayPrice:displayPrice,
      displayPriceSession:displayPriceSession,
      referencePrice:referencePrice,
      change:change,
      percentChange:percentChange,
      providerMarketState:providerMarketState,
      providerTimestamp:providerTimestamp,
      providerTimestampSource:providerTimestampSource,
      receivedAt:new Date().toISOString(),
      freshness:'unknown',
      status:status,
      error:status==='invalid'?{code:'NO_DISPLAY_PRICE',message:'No finite quote price available'}:null
    };
  }

  MarketBrief.marketData={
    markets:markets,
    getMarketCodeForSymbol:getMarketCodeForSymbol,
    normalizeQuote:normalizeQuote
  };
})(window);
