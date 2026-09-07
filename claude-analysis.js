(function(){
  var MarketBrief=window.MarketBrief=window.MarketBrief||{};
  var SCOPE_MARKETS={US:['US'],SG:['SG'],HK:['HK'],ALL:['US','SG','HK']};
  var REPORT_SECTIONS=[
    {name:'EXECUTIVE MARKET SUMMARY',purpose:'Summarize the applicable market outcome or in-progress state and the most important supported conclusions.'},
    {name:'KEY MARKET DRIVERS',purpose:'Identify the material macroeconomic, policy, earnings, geopolitical, sector, and market-specific drivers supported by the package.'},
    {name:'WHAT DROVE / IS DRIVING THE MARKET',purpose:'Explain the supported causal relationship between the material drivers and completed or current market movements, distinguishing current from finalized results.'},
    {name:'STOCKS & SECTORS IN FOCUS',purpose:'Cover materially significant broad-market stocks and sectors independently of My Stocks and Watchlist, grouping shared catalysts while preserving distinct company events.'},
    {name:'MY STOCKS & WATCHLIST - MATERIAL MOVEMENTS',purpose:'Cover material movements and relevant known upcoming events within 14 days for both My Stocks and Watchlist without allowing one unsupported security to collapse the section.'},
    {name:'MARKET INTERPRETATION',purpose:'Provide supported interpretation, significance assessment, qualified inference, and shared-catalyst synthesis without inventing facts.'},
    {name:'KEY RISKS',purpose:'Identify material supported risks and clearly qualify unresolved risk explanations.'},
    {name:'OPPORTUNITIES',purpose:'Identify evidence-supported opportunities without converting incomplete evidence into certainty.'},
    {name:'WHAT TO WATCH FOR NEXT',purpose:'Identify the next material supported catalysts, scheduled events, and unresolved developments to monitor.'},
    {name:'MARKETBRIEF TAKEAWAY',purpose:'State the concise evidence-supported MarketBrief conclusion without padding.'},
    {name:'FURTHER READINGS',purpose:'Use only the validated Further Readings references supplied by MarketBrief; do not create or alter URLs.'}
  ];

  function mapScope(filter){
    var scope=String(filter||'').toUpperCase();
    if(scope==='ALL'||scope==='US'||scope==='SG'||scope==='HK')return scope;
    throw new TypeError('Invalid Market Brief scope');
  }

  function getScopeMarkets(filter){
    return SCOPE_MARKETS[mapScope(filter)].slice();
  }

  function normalizeInitiatingList(value){
    if(value==='myStocks'||value==='watchlist')return value;
    throw new TypeError('Invalid Market Brief initiating list');
  }

  function getPortfolioList(listKey,filter){
    var source=S[listKey];
    if(!source||typeof source!=='object')throw new TypeError('Missing Market Brief portfolio list');
    var securities=[];
    getScopeMarkets(filter).forEach(function(market){
      var tickers=Array.isArray(source[market])?source[market]:[];
      tickers.forEach(function(ticker){
        var symbol=ticker&&typeof ticker.sym==='string'?ticker.sym.trim().toUpperCase():'';
        if(!symbol)throw new TypeError('Invalid Market Brief portfolio ticker');
        securities.push({market:market,symbol:symbol,telemetryRefs:[],evidenceRefs:[],upcomingEvents:[]});
      });
    });
    return securities;
  }

  function getPortfolioContext(filter){
    return {
      myStocks:getPortfolioList('myStocks',filter),
      watchlist:getPortfolioList('customTickers',filter)
    };
  }

  function getUsBenchmarkAnchors(){
    if(!Array.isArray(S.fixedTickers))throw new TypeError('Missing Market Brief benchmark anchors');
    var seen={};
    return S.fixedTickers.filter(function(ticker){return ticker&&ticker.mkt==='US';}).map(function(ticker){
      var symbol=typeof ticker.sym==='string'?ticker.sym.trim().toUpperCase():'';
      if(!symbol||seen[symbol])throw new TypeError('Invalid Market Brief benchmark anchor');
      seen[symbol]=true;
      return {market:'US',symbol:symbol};
    });
  }

  function getUsPackageMembership(listKey,benchmarkSymbols){
    var source=S[listKey];
    if(!source||!Array.isArray(source.US))throw new TypeError('Missing Market Brief portfolio list');
    return source.US.map(function(ticker){
      var symbol=ticker&&typeof ticker.sym==='string'?ticker.sym.trim().toUpperCase():'';
      if(!symbol)throw new TypeError('Invalid Market Brief portfolio ticker');
      if(benchmarkSymbols[symbol])throw new TypeError('Benchmark anchors cannot be portfolio membership');
      return {market:'US',symbol:symbol};
    });
  }

  function createMarketBriefPackageRequest(options){
    options=options||{};
    var scope=mapScope(options.filter===undefined?'US':options.filter);
    var initiatingList=normalizeInitiatingList(options.initiatingList);
    if(scope!=='US')throw new TypeError('Market Brief package acquisition supports US only');
    if(!S||typeof S.tz!=='string'||!S.tz)throw new TypeError('Missing user timezone');
    var benchmarkAnchors=getUsBenchmarkAnchors();
    if(!benchmarkAnchors.length)throw new TypeError('Missing Market Brief benchmark anchors');
    var benchmarkSymbols={};
    benchmarkAnchors.forEach(function(anchor){benchmarkSymbols[anchor.symbol]=true;});
    return {
      benchmarkAnchors:benchmarkAnchors,
      selectedScope:scope,
      initiatingList:initiatingList,
      userTimezone:S.tz,
      myStocks:getUsPackageMembership('myStocks',benchmarkSymbols),
      watchlist:getUsPackageMembership('customTickers',benchmarkSymbols)
    };
  }

  function hasExactKeys(value,keys){
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    var actual=Object.keys(value);
    return actual.length===keys.length&&actual.every(function(key,index){return key===keys[index];});
  }

  function isCanonicalMarketPackage(pkg){
    return hasExactKeys(pkg,['market','marketContext','telemetry','evidenceContext'])
      &&hasExactKeys(pkg.marketContext,['exchangeTimezone','marketState','primaryCompletedSessionDate','includesCurrentOverlay','calendarContext'])
      &&hasExactKeys(pkg.telemetry,['benchmarkSnapshots','stockSnapshots'])
      &&hasExactKeys(pkg.evidenceContext,[
        'evidence','materialEvents','authoritativeFacts','principalCatalysts','supportingEvidence',
        'conflictingEvidence','subsequentDevelopments','unresolvedGaps','furtherReadings'
      ]);
  }

  function orderMarketPackages(marketPackages,filter){
    if(!Array.isArray(marketPackages))throw new TypeError('Canonical marketPackages are required');
    var byMarket={};
    marketPackages.forEach(function(pkg){
      if(!isCanonicalMarketPackage(pkg)||!SCOPE_MARKETS[pkg.market]||pkg.market==='ALL'||byMarket[pkg.market])
        throw new TypeError('Invalid canonical market package');
      byMarket[pkg.market]=pkg;
    });
    return getScopeMarkets(filter).map(function(market){
      if(!byMarket[market])throw new TypeError('Missing canonical market package for '+market);
      return byMarket[market];
    });
  }

  function createMarketBriefRequest(options){
    options=options||{};
    var scope=mapScope(options.filter);
    var initiatingList=normalizeInitiatingList(options.initiatingList);
    var generatedAt=options.now===undefined?new Date():new Date(options.now);
    if(!Number.isFinite(generatedAt.getTime()))throw new TypeError('Invalid Market Brief generation time');
    if(!S||typeof S.tz!=='string'||!S.tz)throw new TypeError('Missing user timezone');
    return {
      analysisRequest:{
        selectedScope:scope,
        initiatingList:initiatingList,
        generatedAt:generatedAt.toISOString(),
        userTimezone:S.tz,
        reportType:'MARKET_BRIEF'
      },
      marketPackages:orderMarketPackages(options.marketPackages,scope),
      portfolioContext:getPortfolioContext(scope),
      outputRequirements:{
        header:'REPORT HEADER / ANALYSIS CONTEXT',
        sections:REPORT_SECTIONS.map(function(section){return {name:section.name,purpose:section.purpose};}),
        maximumWords:2500
      }
    };
  }

  function analysisError(type,message,upstreamStatus){
    var error=new Error(message);
    error.type=type;
    error.upstreamStatus=upstreamStatus===undefined?null:upstreamStatus;
    return error;
  }

  function isCanonicalMarketBriefEnvelope(payload){
    return hasExactKeys(payload,['analysisRequest','marketPackages','portfolioContext','outputRequirements'])
      &&hasExactKeys(payload.analysisRequest,['selectedScope','initiatingList','generatedAt','userTimezone','reportType'])
      &&payload.analysisRequest.selectedScope==='US'
      &&(payload.analysisRequest.initiatingList==='myStocks'||payload.analysisRequest.initiatingList==='watchlist')
      &&payload.analysisRequest.reportType==='MARKET_BRIEF'
      &&Number.isFinite(new Date(payload.analysisRequest.generatedAt).getTime())
      &&Array.isArray(payload.marketPackages)&&payload.marketPackages.length===1
      &&payload.marketPackages[0].market==='US'&&isCanonicalMarketPackage(payload.marketPackages[0])
      &&hasExactKeys(payload.portfolioContext,['myStocks','watchlist'])
      &&Array.isArray(payload.portfolioContext.myStocks)&&Array.isArray(payload.portfolioContext.watchlist)
      &&hasExactKeys(payload.outputRequirements,['header','sections','maximumWords'])
      &&Array.isArray(payload.outputRequirements.sections);
  }

  async function requestMarketBriefPackage(options){
    options=options||{};
    var request=createMarketBriefPackageRequest(options);
    var fetchImpl=options.fetchImpl||(typeof fetch==='function'?fetch:null);
    if(!fetchImpl)throw analysisError('NETWORK_FAILURE','Market Brief package transport unavailable');
    var response;
    try{
      response=await fetchImpl(S.proxyUrl+'/api/quote?analysisPackage=1',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(request)
      });
    }catch(e){
      throw analysisError('NETWORK_FAILURE','Market Brief package request failed');
    }
    var payload;
    try{payload=await response.json();}
    catch(e){throw analysisError('MALFORMED_RESPONSE','Market Brief package response was not valid JSON',response.status);}
    if(!response.ok){
      var backendError=payload&&payload.error;
      if(backendError&&typeof backendError.type==='string')
        throw analysisError(backendError.type,backendError.message||'Market Brief package request failed',backendError.upstreamStatus);
      throw analysisError('HTTP_FAILURE','Market Brief package request failed',response.status);
    }
    if(!isCanonicalMarketBriefEnvelope(payload))
      throw analysisError('MALFORMED_RESPONSE','Market Brief package response was not a canonical envelope',response.status);
    return payload;
  }

  async function requestMarketBriefAnalysis(options){
    options=options||{};
    var request=createMarketBriefRequest(options);
    var fetchImpl=options.fetchImpl||(typeof fetch==='function'?fetch:null);
    if(!fetchImpl)throw analysisError('NETWORK_FAILURE','Structured Claude analysis transport unavailable');
    var response;
    try{
      response=await fetchImpl(S.proxyUrl+'/api/quote?claudeAnalysis=1',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(request)
      });
    }catch(e){
      throw analysisError('NETWORK_FAILURE','Structured Claude analysis request failed');
    }
    var payload;
    try{payload=await response.json();}
    catch(e){throw analysisError('MALFORMED_RESPONSE','Structured Claude analysis response was not valid JSON',response.status);}
    if(!response.ok){
      var backendError=payload&&payload.error;
      if(backendError&&typeof backendError.type==='string')
        throw analysisError(backendError.type,backendError.message||'Structured Claude analysis failed',backendError.upstreamStatus);
      throw analysisError('HTTP_FAILURE','Structured Claude analysis failed',response.status);
    }
    if(!payload||typeof payload!=='object'||!Object.prototype.hasOwnProperty.call(payload,'result'))
      throw analysisError('MALFORMED_RESPONSE','Structured Claude analysis response did not contain a result',response.status);
    return payload.result;
  }

  MarketBrief.claudeAnalysis={
    mapScope:mapScope,
    getScopeMarkets:getScopeMarkets,
    getPortfolioContext:getPortfolioContext,
    createMarketBriefPackageRequest:createMarketBriefPackageRequest,
    requestMarketBriefPackage:requestMarketBriefPackage,
    createMarketBriefRequest:createMarketBriefRequest,
    requestMarketBriefAnalysis:requestMarketBriefAnalysis
  };
})();
