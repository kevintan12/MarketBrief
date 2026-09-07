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
  var REPORT_HEADER='REPORT HEADER / ANALYSIS CONTEXT';
  var ANALYSIS_STATUSES={NORMAL:true,DEGRADED:true,FAILED:true};

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

  function escapeHTML(value){
    return String(value===null||value===undefined?'':value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function canonicalReferenceMaps(envelope){
    if(!isCanonicalMarketBriefEnvelope(envelope))throw new TypeError('Invalid canonical Market Brief envelope');
    var evidence={},telemetry={};
    envelope.marketPackages.forEach(function(pkg){
      if(!Array.isArray(pkg.evidenceContext.evidence))throw new TypeError('Invalid canonical evidence references');
      pkg.evidenceContext.evidence.forEach(function(entry){
        if(!entry||typeof entry.reference!=='string'||!entry.reference||evidence[entry.reference]||!entry.item)
          throw new TypeError('Invalid canonical evidence reference');
        evidence[entry.reference]=entry.item;
      });
      ['benchmarkSnapshots','stockSnapshots'].forEach(function(key){
        if(!Array.isArray(pkg.telemetry[key]))throw new TypeError('Invalid canonical telemetry references');
        pkg.telemetry[key].forEach(function(entry){
          if(!entry||typeof entry.reference!=='string'||!entry.reference||telemetry[entry.reference]||!entry.snapshot)
            throw new TypeError('Invalid canonical telemetry reference');
          telemetry[entry.reference]=entry.snapshot;
        });
      });
    });
    return {evidence:evidence,telemetry:telemetry};
  }

  function requireReferenceArray(value,available,name){
    if(!Array.isArray(value))throw new TypeError('Invalid structured '+name+' references');
    var seen={};
    value.forEach(function(reference){
      if(typeof reference!=='string'||!available[reference]||seen[reference])
        throw new TypeError('Invalid structured '+name+' reference');
      seen[reference]=true;
    });
    return value;
  }

  function requireStringArray(value,name){
    if(!Array.isArray(value)||value.some(function(item){return typeof item!=='string'||!item.trim();}))
      throw new TypeError('Invalid structured '+name);
    return value;
  }

  function validEvidenceUrl(value){
    return typeof value==='string'&&/^https?:\/\/[^\s"'<>]+$/i.test(value);
  }

  function renderText(value){
    return String(value).split(/\r?\n/).map(function(line){
      return '<div style="font-size:1.05rem;line-height:1.8;color:var(--txt);margin-bottom:4px;">'
        +escapeHTML(line)+'</div>';
    }).join('');
  }

  function formatReportTimestamp(value,timeZone){
    var date=new Date(value);
    if(!Number.isFinite(date.getTime()))throw new TypeError('Invalid structured Market Brief generation time');
    var parts;
    try{
      parts=new Intl.DateTimeFormat('en-GB',{
        timeZone:timeZone,day:'2-digit',month:'2-digit',year:'numeric',
        hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'
      }).formatToParts(date);
    }catch(e){throw new TypeError('Invalid structured Market Brief user timezone');}
    var values={};
    parts.forEach(function(part){if(part.type!=='literal')values[part.type]=part.value;});
    var zone=timeZone==='Asia/Singapore'?'SGT':values.timeZoneName||timeZone;
    return values.day+'-'+values.month+'-'+values.year+' · '+values.hour+':'+values.minute+' '+zone;
  }

  function renderSectionReferences(section,maps){
    var items=[];
    section.evidenceRefs.forEach(function(reference){
      var item=maps.evidence[reference];
      var label=escapeHTML(item.title||reference);
      items.push(validEvidenceUrl(item.canonicalUrl)
        ?'<a href="'+escapeHTML(item.canonicalUrl)+'" target="_blank" rel="noopener" style="color:var(--acc);text-decoration:underline;">'+label+'</a>'
        :label);
    });
    section.telemetryRefs.forEach(function(reference){
      var snapshot=maps.telemetry[reference];
      items.push(escapeHTML(snapshot.instrumentName||snapshot.symbol||reference));
    });
    return items.length?'<div style="color:var(--mut);font-size:0.85rem;margin-top:8px;">References: '+items.join(' · ')+'</div>':'';
  }

  function renderMarketBriefAnalysis(result,envelope){
    var maps=canonicalReferenceMaps(envelope);
    if(!hasExactKeys(result,['status','reportContext','sections','evidenceReferences','furtherReadings','evidenceGaps'])
      ||!ANALYSIS_STATUSES[result.status])throw new TypeError('Invalid structured Market Brief result');
    var context=result.reportContext;
    if(!hasExactKeys(context,['header','selectedScope','generatedAt','userTimezone','reportType','markets'])
      ||context.header!==REPORT_HEADER
      ||context.selectedScope!==envelope.analysisRequest.selectedScope
      ||context.generatedAt!==envelope.analysisRequest.generatedAt
      ||context.userTimezone!==envelope.analysisRequest.userTimezone
      ||context.reportType!==envelope.analysisRequest.reportType
      ||!Array.isArray(context.markets))throw new TypeError('Invalid structured Market Brief report context');
    if(!Array.isArray(result.sections)||result.sections.length!==REPORT_SECTIONS.length)
      throw new TypeError('Invalid structured Market Brief sections');
    requireReferenceArray(result.evidenceReferences,maps.evidence,'evidence');
    requireReferenceArray(result.furtherReadings,maps.evidence,'Further Reading');
    requireStringArray(result.evidenceGaps,'evidence gaps');
    var generatedForReader=formatReportTimestamp(context.generatedAt,context.userTimezone);

    var html='<div class="sumbox"><div class="sumhdr" style="justify-content:space-between;">'
      +'<div style="display:flex;align-items:center;gap:8px;"><span class="badge">AI · Claude</span>'
      +'<span class="sumdate" style="margin-left:4px">'+escapeHTML(context.selectedScope)+' · '+escapeHTML(result.status)
      +' · '+escapeHTML(generatedForReader)+'</span></div>'
      +'<button class="pdf-btn" data-export="sum" style="background:none;border:1px solid var(--bor);color:var(--mut);border-radius:6px;padding:3px 10px;font-size:0.85rem;cursor:pointer;font-family:DM Mono,monospace;">PDF</button></div>'
      +'<div style="font-family:Syne,sans-serif;font-weight:700;font-size:1.15rem;color:var(--orange);margin-top:12px;margin-bottom:8px;">'
      +escapeHTML(context.header)+'</div>';
    result.sections.forEach(function(section,index){
      if(!hasExactKeys(section,['name','content','evidenceRefs','telemetryRefs','uncertainties'])
        ||section.name!==REPORT_SECTIONS[index].name
        ||(section.content!==null&&(typeof section.content!=='string'||!section.content.trim())))
        throw new TypeError('Invalid structured Market Brief section '+(index+1));
      requireReferenceArray(section.evidenceRefs,maps.evidence,'evidence');
      requireReferenceArray(section.telemetryRefs,maps.telemetry,'telemetry');
      requireStringArray(section.uncertainties,'uncertainties');
      html+='<div style="font-family:Syne,sans-serif;font-weight:700;font-size:1.15rem;color:var(--orange);margin-top:20px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(249,115,22,0.25);">'
        +(index+1)+'. '+escapeHTML(section.name)+'</div>';
      if(index===REPORT_SECTIONS.length-1){
        var readings=[];
        result.furtherReadings.forEach(function(reference){
          var item=maps.evidence[reference];
          if(validEvidenceUrl(item.canonicalUrl))readings.push('<div style="margin-bottom:8px;"><a href="'
            +escapeHTML(item.canonicalUrl)+'" target="_blank" rel="noopener" style="color:var(--acc);text-decoration:underline;">'
            +escapeHTML(item.title||reference)+'</a></div>');
        });
        html+=readings.length?readings.join(''):'<div style="color:var(--mut);">No validated Further Readings were supplied.</div>';
      }else if(section.content!==null){
        html+=renderText(section.content);
      }else{
        html+='<div style="color:var(--mut);">No supported analysis is available from the supplied package.</div>';
      }
      html+=renderSectionReferences(section,maps);
    });
    return html+'</div>';
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
    var request;
    if(Object.prototype.hasOwnProperty.call(options,'envelope')){
      if(!isCanonicalMarketBriefEnvelope(options.envelope))
        throw analysisError('INVALID_REQUEST','Canonical Market Brief envelope is required');
      request=options.envelope;
    }else request=createMarketBriefRequest(options);
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
    requestMarketBriefAnalysis:requestMarketBriefAnalysis,
    renderMarketBriefAnalysis:renderMarketBriefAnalysis
  };
})();
