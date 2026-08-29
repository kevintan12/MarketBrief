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

  MarketBrief.marketData={
    markets:markets,
    getMarketCodeForSymbol:getMarketCodeForSymbol
  };
})(window);
