// ── PIN Protection ───────────────────────────────────────────────────────────
var _pinBuffer='';
var _defaultPinHash='8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
async function sha256(str){
  var buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
}
function getStoredPinHash(){
  try{return localStorage.getItem('mb_pin_hash')||_defaultPinHash;}catch(e){return _defaultPinHash;}
}
function pinKey(k){
  var err=document.getElementById('pinErr');
  if(err) err.textContent='';
  if(k==='C'){_pinBuffer=_pinBuffer.slice(0,-1);updatePinDots();return;}
  if(k==='OK'){checkPin();return;}
  if(_pinBuffer.length>=6) return;
  _pinBuffer+=k;
  updatePinDots();
  if(_pinBuffer.length===6) setTimeout(checkPin,80);
}
function updatePinDots(){
  var dots=document.querySelectorAll('.pd');
  dots.forEach(function(d,i){
    d.style.background=i<_pinBuffer.length?'#00d4ff':'transparent';
    d.style.borderColor=i<_pinBuffer.length?'#00d4ff':'#1e2d45';
  });
}
async function checkPin(){
  var hash=await sha256(_pinBuffer);
  if(hash===getStoredPinHash()){
    try{sessionStorage.setItem('mb_auth','1');}catch(e){}
    document.getElementById('pinOverlay').style.display='none';
  } else {
    _pinBuffer='';
    updatePinDots();
    var pad=document.getElementById('pinPad');
    var err=document.getElementById('pinErr');
    if(pad){pad.classList.add('pin-shake');setTimeout(function(){pad.classList.remove('pin-shake');},400);}
    if(err) err.textContent='Incorrect PIN';
  }
}
async function changePIN(current,newPin,confirm){
  if(newPin.length!==6) return 'PIN must be 6 digits';
  if(newPin!==confirm) return 'New PINs do not match';
  var currentHash=await sha256(current);
  if(currentHash!==getStoredPinHash()) return 'Current PIN incorrect';
  var newHash=await sha256(newPin);
  try{localStorage.setItem('mb_pin_hash',newHash);}catch(e){return 'Could not save PIN';}
  return 'ok';
}
function initPIN(){
  var authed=false;
  try{authed=sessionStorage.getItem('mb_auth')==='1';}catch(e){}
  if(!authed){
    document.getElementById('pinOverlay').style.display='flex';
  }
}
// Keyboard listener — always active, guards on overlay visibility
document.addEventListener('keydown',function(e){
  var overlay=document.getElementById('pinOverlay');
  if(!overlay||overlay.style.display==='none'||overlay.style.display==='') return;
  if(e.key>='0'&&e.key<='9'){e.preventDefault();pinKey(e.key);}
  else if(e.key==='Backspace'){e.preventDefault();pinKey('C');}
  else if(e.key==='Enter'){e.preventDefault();pinKey('OK');}
});

// ── Version cache-bust ────────────────────────────────────────────────────────
(function(){
  var CURRENT='v2.315.22';
  try{
    var last=sessionStorage.getItem('mb_ver');
    if(last&&last!==CURRENT){sessionStorage.setItem('mb_ver',CURRENT);}
    else if(!last){sessionStorage.setItem('mb_ver',CURRENT);}
  }catch(e){}
  // Fetch the live page with no-cache to check if a newer version exists
  if('serviceWorker' in navigator) return; // skip if SW handles it
  fetch(location.href,{cache:'no-store',method:'HEAD'}).then(function(r){
    var ver=r.headers.get('x-app-version')||'';
    // GitHub Pages won't return custom headers, so instead we reload once per session
    // if the page was loaded from cache (performance.navigation.type===2 means back/forward)
  }).catch(function(){});
})();
// ── State ─────────────────────────────────────────────────────────────────────
var MarketBrief = window.MarketBrief = window.MarketBrief || {};
MarketBrief.config = {
  proxyUrl:'', style:'detailed', tz:'Asia/Singapore',
  // DJI first, then IXIC, then GSPC for US order
  fixedTickers:[
    {sym:'^DJI',  name:'Dow Jones', sub:'US · DJIA',              flag:'🇺🇸', mkt:'US'},
    {sym:'^IXIC', name:'Nasdaq',    sub:'US · Composite',         flag:'🇺🇸', mkt:'US'},
    {sym:'^GSPC', name:'S&P 500',   sub:'US · NYSE/Nasdaq',       flag:'🇺🇸', mkt:'US'},
    {sym:'^STI',  name:'STI',       sub:'SG · Straits Times Idx', flag:'🇸🇬', mkt:'SG'},
    {sym:'^HSI',  name:'Hang Seng', sub:'HK · Hang Seng Idx',    flag:'🇭🇰', mkt:'HK'},
  ],
  customTickers:{
    US:[],
    SG:[],
    HK:[]
  }
};
var S = MarketBrief.config;
var mktData=[], curFilter='all', isDesktop=false, currentView='Dash';
var FIXED_SYMS={'^DJI':1,'^IXIC':1,'^GSPC':1,'^STI':1,'^HSI':1};
var acTimers={};  // debounce timers keyed by input id

// ── Boot ──────────────────────────────────────────────────────────────────────
window.onload=function(){
  initPIN();
  loadSettings();
  detectLayout();
  window.addEventListener('resize',detectLayout);
  tickClock(); setInterval(tickClock,1000);
  renderSettingsPanelTo('settingsPanel');
  loadDash();
  startAutoRefresh();
  // Force fresh content check — reload if a newer version is deployed
  setTimeout(function(){
    fetch(location.href,{cache:'no-store'})
      .then(function(r){return r.text();})
      .then(function(html){
        var m=html.match(/class="logo-ver"[^>]*>(v[\d.]+)<\/span>/);
        if(m&&m[1]&&m[1]!=='v2.315.22'){
          console.log('New version '+m[1]+' available, reloading…');
          location.reload(true);
        }
      }).catch(function(){});
  }, 3000);
  // Event delegation for search result buttons
  document.addEventListener('click',function(e){
    var card=e.target.closest('.card[data-sym]');
    if(card&&card.dataset.sym){goToSearch(card.dataset.sym);return;}
    var ab=e.target.closest('.analyze-btn:not(.about-btn)');
    if(ab&&ab.dataset.sym){triggerTickerAI(ab.dataset.sym,ab.dataset.res,ab);return;}
    var bb=e.target.closest('.about-btn');
    if(bb&&bb.dataset.sym){triggerAboutAI(bb.dataset.sym,bb.dataset.res,bb,bb.dataset.name||bb.dataset.sym);return;}
    var pb=e.target.closest('.pdf-btn');
    if(pb&&pb.dataset.export){exportToPDF(pb.dataset.export);return;}
  });

};

function detectLayout(){
  isDesktop=window.innerWidth>=769;
  document.getElementById('desktopWrap').style.display=isDesktop?'flex':'none';
  document.getElementById('mobileWrap').style.display=isDesktop?'none':'block';
  document.getElementById('mBnav').style.display=isDesktop?'none':'flex';
  if(isDesktop) renderDesktop();
}

function tickClock(){
  var tz=S.tz||'Asia/Singapore';
  var lbl={'Asia/Singapore':'SGT','Asia/Hong_Kong':'HKT','America/New_York':'ET','UTC':'UTC'}[tz]||'';
  var now=new Date();
  document.getElementById('hTime').innerHTML=
    now.toLocaleDateString('en-SG',{timeZone:tz,month:'short',day:'numeric'})
    +' &middot; '+now.toLocaleTimeString('en-SG',{timeZone:tz,hour:'2-digit',minute:'2-digit'})+' '+lbl;
}

// ── Navigation ────────────────────────────────────────────────────────────────
function showView(name){
  // Save search content BEFORE switching away
  if(currentView==='Search'){
    // Try mobile first, then desktop; normalize IDs to always use 'tickRes' base
    var _trM=document.getElementById('tickRes');
    var _trD=document.getElementById('tickResD');
    var _saved='';
    if(_trM&&_trM.innerHTML&&_trM.innerHTML.length>200) _saved=_trM.innerHTML;
    else if(_trD&&_trD.innerHTML&&_trD.innerHTML.length>200) _saved=_trD.innerHTML.replace(/_tickResD"/g,'_tickRes"').replace(/_tickResD'/g,"_tickRes'");
    if(_saved) savedSearchHTML=_saved;
    var _inp=document.getElementById('ac_searchBox')||document.getElementById('ac_searchBoxD');
    if(_inp&&_inp.value) savedSearchQuery=_inp.value;
  }
  currentView=name;
  if(isDesktop){
    ['Dash','Search','Invest','Settings'].forEach(function(v){
      var e=document.getElementById('sn-'+v);if(e)e.classList.toggle('on',v===name);
    });
    renderDesktop();
  } else {
    ['Dash','Search','Invest','Settings'].forEach(function(v){
      document.getElementById('v'+v).style.display=v===name?'':'none';
      document.getElementById('bn-'+v).classList.toggle('on',v===name);
    });
    if(name==='Search'){
      // Only render search box on first visit — after that the DOM is preserved
      var existingInp=document.getElementById('ac_searchBox');
      if(!existingInp) renderSearchBox('searchBox','tickRes');
    }
    if(name==='Settings') renderSettingsPanelTo('settingsPanel');
    if(name==='Invest') renderInvestView('investPanel');
    if(name==='Dash') {
      renderIndices(); updateLiveIndicator();
      // Restore active chip highlight
      document.querySelectorAll('#mktChips .chip').forEach(function(b){
        b.classList.toggle('on', b.dataset.filter===curFilter);
      });
      setTimeout(function(){var sa=document.getElementById('sumArea');if(sa&&savedSumHTML){sa.innerHTML=savedSumHTML;}},50);
    }
  }
}

// ── Desktop ───────────────────────────────────────────────────────────────────
function renderDesktop(){
  var dc=document.getElementById('desktopContent'); if(!dc)return;
  if(currentView==='Dash'){
    dc.innerHTML=
      '<div class="desktop-grid">'
      +'<div class="col-left">'
        +'<div class="rfrow"><button class="rfbtn" onclick="loadDash()">↻ Refresh</button></div>'
        +'<div class="chips" id="mktChipsD">'
          +'<button class="chip on" data-filter="all" onclick="setFilterD(\'all\',this)">All</button>'
          +'<button class="chip" data-filter="US" onclick="setFilterD(\'US\',this)">🇺🇸 US</button>'
          +'<button class="chip" data-filter="SG" onclick="setFilterD(\'SG\',this)">🇸🇬 SGX</button>'
          +'<button class="chip" data-filter="HK" onclick="setFilterD(\'HK\',this)">🇭🇰 HKEX</button>'
        +'</div>'
        +'<div class="slabel notop">Market Indices <span id="liveIndD" style="font-size:0.85rem;margin-left:6px"></span></div>'
        +'<div class="idx-scroll" id="idxGridD"><div class="msg">Loading… <span class="spin"></span></div></div>'
      +'</div>'
      +'<div class="col-right">'
        +'<div class="slabel notop"><span class="dot"></span>AI Summary</div>'
        +'<button class="ai-btn" id="aiBtnD" onclick="triggerSummary()">✦ Generate AI Summary</button>'
        +'<div id="sumAreaD"></div>'
      +'</div>'
      +'</div>';
    renderIndices();
    setTimeout(updateLiveIndicator,50);
    // Restore active chip
    document.querySelectorAll('#mktChipsD .chip').forEach(function(b){
      b.classList.toggle('on',b.dataset.filter===curFilter);
    });
    window._tryRTimer=null;(function tryR(n){window._tryRTimer=setTimeout(function(){var sd=document.getElementById('sumAreaD');if(sd&&savedSumHTML){sd.innerHTML=savedSumHTML;}else if(n>0)tryR(n-1);},80);})(5);
  } else if(currentView==='Search'){
    // If we have a cached search DOM, restore it directly instead of re-rendering
    if(savedSearchHTML&&savedSearchQuery){
      dc.innerHTML='<div style="padding:24px;max-width:620px">'
        +'<div class="slabel notop">Search by Name or Ticker</div>'
        +'<div id="searchBoxD"></div><div id="tickResD"></div></div>';
      renderSearchBox('searchBoxD','tickResD');
      setTimeout(function(){
        var tr=document.getElementById('tickResD');
        // Normalize IDs: saved HTML may use 'tickRes' (mobile) or 'tickResD' (desktop)
        var html=savedSearchHTML.replace(/_tickRes"/g,'_tickResD"').replace(/_tickRes'/g,"_tickResD'");
        if(tr) tr.innerHTML=html;
        var inp=document.getElementById('ac_searchBoxD');
        if(inp) inp.value=savedSearchQuery;
      },30);
    } else {
      dc.innerHTML='<div style="padding:24px;max-width:620px">'
        +'<div class="slabel notop">Search by Name or Ticker</div>'
        +'<div id="searchBoxD"></div><div id="tickResD"></div></div>';
      renderSearchBox('searchBoxD','tickResD');
    }
  } else if(currentView==='Invest'){
    dc.innerHTML='<div style="padding:24px;max-width:720px"><div class="slabel notop">Investment Ideas</div><div id="investPanelD"></div></div>';
    renderInvestView('investPanelD');
  } else if(currentView==='Settings'){
    dc.innerHTML='<div style="padding:24px;max-width:720px"><div class="slabel notop">Configuration</div><div class="spanel" id="settingsPanelD"></div></div>';
    renderSettingsPanelTo('settingsPanelD');
  }
}


MarketBrief.searchAI={
  results:Object.create(null),
  inFlight:Object.create(null),
  resIdToken:'__MB_SEARCH_RES_ID__'
};
function normalizeTickerAISymbol(sym){return String(sym||'').trim().toUpperCase();}
function getTickerAIRecord(sym,kind){
  var records=MarketBrief.searchAI.results[normalizeTickerAISymbol(sym)];
  return records?records[kind]||null:null;
}
function storeTickerAIRecord(sym,kind,content,resId){
  var key=normalizeTickerAISymbol(sym);
  if(!MarketBrief.searchAI.results[key]) MarketBrief.searchAI.results[key]={};
  MarketBrief.searchAI.results[key][kind]={
    kind:kind,
    symbol:key,
    generatedAt:new Date().toISOString(),
    content:String(content||'').split(resId).join(MarketBrief.searchAI.resIdToken)
  };
}
function renderTickerAIRecord(record,resId){
  var el=document.getElementById('tai_'+resId); if(!el)return false;
  el.innerHTML=record.content.split(MarketBrief.searchAI.resIdToken).join(resId);
  return true;
}
function setTickerAIButtonsBusy(resId,busy,kind){
  var an=document.getElementById('anBtn_'+resId);
  var ab=document.getElementById('abBtn_'+resId);
  if(an){an.style.display='';an.disabled=busy;an.textContent=busy&&kind==='ticker-analysis'?'Analysing…':'✦ Analyse with AI';}
  if(ab){ab.disabled=busy;ab.textContent=busy&&kind==='ticker-about'?'Loading…':'ℹ About';}
}
async function triggerTickerAI(sym,resId,btn){
  var key=normalizeTickerAISymbol(sym),kind='ticker-analysis';
  if(MarketBrief.searchAI.inFlight[resId])return;
  var cached=getTickerAIRecord(key,kind);
  if(cached){renderTickerAIRecord(cached,resId);return;}
  MarketBrief.searchAI.inFlight[resId]={kind:kind,symbol:key};
  setTickerAIButtonsBusy(resId,true,kind);
  try{await genTickerAI(key,null,resId);}
  finally{
    delete MarketBrief.searchAI.inFlight[resId];
    setTickerAIButtonsBusy(resId,false,kind);
  }
}

// ── AI button visibility ──────────────────────────────────────────────────────
function setAIBtnVisible(show){
  ['aiBtnM','aiBtnD'].forEach(function(id){
    var e=document.getElementById(id);
    if(e) e.style.display=show?'flex':'none';
  });
}
function triggerSummary(){
  if(!S.proxyUrl){setSumHTML('<div class="msg err">Add your Proxy URL in ⚙ Settings.</div>');return;}
  if(!mktData.length){setSumHTML('<div class="msg err">Load data first — click ↻ Refresh.</div>');return;}
  // Cancel any pending restore and clear old summary before generating fresh
  if(window._tryRTimer){clearTimeout(window._tryRTimer);window._tryRTimer=null;}
  savedSumHTML='';
  setSumHTML('');
  setAIBtnVisible(false);
  loadSummary();
}

// ── Data ──────────────────────────────────────────────────────────────────────
function getAllTickers(){
  var all=S.fixedTickers.slice();
  ['US','SG','HK'].forEach(function(m){all=all.concat(S.customTickers[m]||[]);});
  return all;
}
var _quoteFetches={};
async function fetchQuote(sym){
  if(!S.proxyUrl)throw new Error('no_proxy');
  var key=String(sym).toUpperCase();
  if(_quoteFetches[key])return _quoteFetches[key];
  var request=(async function(){
    var r=await fetch(S.proxyUrl+'/api/quote?symbol='+encodeURIComponent(sym));
    if(!r.ok)throw new Error('HTTP '+r.status);
    var d=await r.json(); if(d.error)throw new Error(d.error);
    return d;
  })();
  _quoteFetches[key]=request;
  try{return await request;}
  finally{if(_quoteFetches[key]===request)delete _quoteFetches[key];}
}
async function loadDash(){
  setGridHTML('<div class="msg">Loading… <span class="spin"></span></div>');
  setAIBtnVisible(true);
  if(!S.proxyUrl){
    setGridHTML('<div class="msg">👋 Welcome! Go to <strong style="color:var(--txt)">⚙ Settings</strong> and enter your Proxy URL.</div>');
    return;
  }
  var tickers=getAllTickers();
  var results=await Promise.allSettled(tickers.map(function(t){return fetchQuote(t.sym);}));
  mktData=[];
  tickers.forEach(function(t,i){
    var r=results[i];
    if(r.status==='fulfilled'){
      var quote=MarketBrief.marketData.normalizeQuote(r.value,t.sym);
      if(quote.status!=='invalid')
        mktData.push({sym:t.sym,name:quote.name||t.name,sub:t.sub,flag:t.flag,mkt:t.mkt,price:quote.displayPrice,chg:quote.change,pct:quote.percentChange});
    }
  });
  renderIndices();
  if(!mktData.length) setGridHTML('<div class="msg err">Could not load data. Check Proxy URL.</div>');
  startAutoRefresh();
}
function setSumHTML(h){var a=document.getElementById('sumArea'),b=document.getElementById('sumAreaD');if(a)a.innerHTML=h;if(b)b.innerHTML=h;}

// ── Real-time auto-refresh ────────────────────────────────────────────────────
var autoRefreshTimer=null;
var lastSearchSym=null;
var savedSumHTML='';
var savedSearchHTML='';
var savedSearchQuery='';
var savedInvestHTML='';

function isAnyMarketOpen(){
  var now=new Date(), day=now.getDay();
  function mins(tz){ var h=parseInt(now.toLocaleString('en-US',{timeZone:tz,hour:'numeric',hour12:false})),m=parseInt(now.toLocaleString('en-US',{timeZone:tz,minute:'numeric'})); return h*60+m; }
  function sessionMins(value){var parts=value.split(':');return parseInt(parts[0])*60+parseInt(parts[1]);}
  var markets=MarketBrief.marketData.markets;
  var et=mins(markets.US.timezone), sg=mins(markets.SG.timezone), hk=mins(markets.HK.timezone);
  var usOpen=sessionMins(markets.US.open), usClose=sessionMins(markets.US.close);
  var sgOpen=sessionMins(markets.SG.open), sgClose=sessionMins(markets.SG.close);
  var hkOpen=sessionMins(markets.HK.open), hkClose=sessionMins(markets.HK.close);
  var wk=day>=1&&day<=5;
  return {
    any: wk&&((et>=usOpen&&et<usClose)||(sg>=sgOpen&&sg<sgClose)||(hk>=hkOpen&&hk<hkClose)),
    US:  wk&&et>=usOpen&&et<usClose,
    SG:  wk&&sg>=sgOpen&&sg<sgClose,
    HK:  wk&&hk>=hkOpen&&hk<hkClose
  };
}

function isTradingNow(sym){
  var s=isAnyMarketOpen();
  return s[MarketBrief.marketData.getMarketCodeForSymbol(sym)];
}

function getOpenLabel(){
  var s=isAnyMarketOpen(), open=[];
  if(s.US)open.push('\u{1F1FA}\u{1F1F8}');
  if(s.SG)open.push('\u{1F1F8}\u{1F1EC}');
  if(s.HK)open.push('\u{1F1ED}\u{1F1F0}');
  return open.length?open.join(' ')+' LIVE':null;
}

function getDashboardPollingMarkets(now,tick){
  var polling={any:false};
  ['US','SG','HK'].forEach(function(mkt){
    var state=MarketBrief.marketData.getSessionState(mkt,now);
    var cadence=state.quoteExpectedToMove?2:(MarketBrief.marketData.shouldPollSearchQuote(mkt,now)?5:0);
    polling[mkt]=!!cadence&&(tick===undefined||tick%cadence===0);
    if(polling[mkt])polling.any=true;
  });
  return polling;
}

async function silentRefreshDash(pollingMarkets){
  if(!S.proxyUrl||!mktData.length)return;
  var s=pollingMarkets||getDashboardPollingMarkets();
  if(!s.any)return; // markets all closed — no fetching
  // Only fetch tickers whose market/session expects quote movement
  var tickers=getAllTickers().filter(function(t){return s[t.mkt];});
  if(!tickers.length)return;
  var results=await Promise.allSettled(tickers.map(function(t){return fetchQuote(t.sym);}));
  var updated=false;
  tickers.forEach(function(t,i){
    var r=results[i];
    if(r.status==='fulfilled'){
      var quote=MarketBrief.marketData.normalizeQuote(r.value,t.sym);
      if(quote.status==='invalid')return;
      var ex=mktData.find(function(x){return x.sym===t.sym;});
      if(ex){ex.price=quote.displayPrice;ex.chg=quote.change;ex.pct=quote.percentChange;updated=true;}
    }
  });
  if(updated)renderIndices();
  updateLiveIndicator();
}

async function silentRefreshTicker(sym){
  try{
    var rawQuote=await fetchQuote(sym);
    var quote=MarketBrief.marketData.normalizeQuote(rawQuote,sym);
    if(quote.status==='invalid')return;
    ['tickRes','tickResD'].forEach(function(resId){
      var cls=Math.abs(quote.percentChange)<0.01?'neu':(quote.percentChange>=0?'up':'dn');
      var arr=cls==='neu'?'—':(quote.percentChange>=0?'▲':'▼');
      var pr=document.getElementById('tprice_'+resId);
      var chg=document.getElementById('tcchg_'+resId);
      if(pr){pr.className='tprice '+cls;pr.textContent=fmt(quote.displayPrice);}
      if(chg){chg.className='cchg '+cls;chg.textContent=arr+' '+fmtD(quote.change)+' ('+fmtP(quote.percentChange)+')';}
      var s0=document.getElementById('tssv0_'+resId);
      var s1=document.getElementById('tssv1_'+resId);
      var s2=document.getElementById('tssv2_'+resId);
      var s3=document.getElementById('tssv3_'+resId);
      // High, low and volume remain outside the canonical contract for now.
      if(s0){s0.className='ssv';s0.textContent=fmtVol(rawQuote.volume);}
      if(s1)s1.textContent=fmt(quote.previousClose);
      if(s2)s2.textContent=fmt(rawQuote.high);
      if(s3)s3.textContent=fmt(rawQuote.low);
    });
    refreshSearchSessionPresentation(sym);
  }catch(e){}
}

function updateLiveIndicator(){
  var labels={preMarket:'Pre-Market',regular:'Trading',postMarket:'After-Hours',regularMorning:'Trading',lunchBreak:'Lunch Break',regularAfternoon:'Trading'};
  var active=[];
  var mkts = curFilter==='all' ? ['US','SG','HK'] : [curFilter];
  mkts.forEach(function(m){
    var state=MarketBrief.marketData.getSessionState(m);
    if(labels[state.session])active.push({label:{US:'🇺🇸',SG:'🇸🇬',HK:'🇭🇰'}[m]+' '+labels[state.session],moving:state.quoteExpectedToMove});
  });
  var label=active.length ? active.map(function(x){return x.label;}).join(' · ') : null;
  var moving=active.some(function(x){return x.moving;});
  ['liveIndM','liveIndD'].forEach(function(id){
    var el=document.getElementById(id); if(!el)return;
    if(label){el.innerHTML=(moving?'<span class="dot"></span>':'')+label;el.style.color=moving?'var(--grn)':'var(--mut)';}
    else{el.innerHTML='Market Closed';el.style.color='var(--mut)';}
  });
}

function getSearchPollingCadence(sym,now){
  if(!sym)return 0;
  var state=MarketBrief.marketData.getSessionState(sym,now);
  if(state.quoteExpectedToMove)return 2;
  return MarketBrief.marketData.shouldPollSearchQuote(sym,now)?5:0;
}

var _refreshTick=0, _refreshInFlight=false, _searchRefreshInFlight=false;
function startAutoRefresh(){
  if(autoRefreshTimer)clearInterval(autoRefreshTimer);
  _refreshTick=0;
  autoRefreshTimer=setInterval(function(){
    _refreshTick++;
    updateLiveIndicator();
    refreshSearchSessionPresentation(lastSearchSym);
    // Refresh active Dashboard markets every 2s; SG/HK post-close grace every 5s
    var dashboardPolling=getDashboardPollingMarkets(undefined,_refreshTick);
    if(!_refreshInFlight && dashboardPolling.any){
      _refreshInFlight=true;
      silentRefreshDash(dashboardPolling).finally(function(){_refreshInFlight=false;});
    }
    // Active Search quotes refresh every 2s; SG/HK post-close grace remains every 5s
    var searchCadence=getSearchPollingCadence(lastSearchSym);
    if(searchCadence&&_refreshTick%searchCadence===0&&!_searchRefreshInFlight){
      _searchRefreshInFlight=true;
      silentRefreshTicker(lastSearchSym).finally(function(){_searchRefreshInFlight=false;});
    }
  },1000);
  updateLiveIndicator();
}
// ── AI Summary ────────────────────────────────────────────────────────────────
async function loadSummary(){
  console.log('MB: loadSummary started');
  setSumHTML('<div class="msg">Generating AI summary… <span class="spin"></span></div>');
  var summaryNow=new Date();
  var mktsToShow=curFilter==='all'?['US','SG','HK']:[curFilter];
  var styleInstr={
    detailed:'For each market section write 3-4 sentences. If the market is LIVE (session in progress), analyse what is happening RIGHT NOW in the current session — intraday moves, what is driving price action today, and what to watch for the rest of the session. If the market is closed, analyse the completed session. Cover: (1) what moved and by how much, (2) specific triggers or catalysts (macro data, Fed comments, earnings, geopolitical events, sector rotation), (3) notable individual movers, (4) near-term outlook. Be analytical, not just descriptive.',
    concise:'STRICT — each section must be exactly 2 sentences, no more. Sentence 1: key move with exact % and number. Sentence 2: single most important driver or catalyst. No sub-labels, no elaboration.',
    bullets:'Use 3-4 bullet points per section starting with -. First bullet = headline move, remaining bullets = specific catalysts and drivers. If LIVE, focus on what is happening now.'
  };
  var sections=[];
  var sectionLabels={US:'🇺🇸 US Markets',SG:'🇸🇬 Singapore Markets',HK:'🇭🇰 Hong Kong Markets'};
  var prompt='You are a financial analyst writing for a Singapore-based investor. The price and change data below is live-fetched from Yahoo Finance — treat it as accurate and current. Do NOT question the data or claim you lack real-time access. Search the web for today\'s market news and catalysts, then write your analysis directly. Be direct, use plain English and real numbers, explain the why behind every move.\n\n';
  var marketStates={},liveMarkets={any:false};
  mktsToShow.forEach(function(mkt){
    var state=MarketBrief.marketData.getSessionState(mkt,summaryNow);
    marketStates[mkt]=state;
    liveMarkets[mkt]=state.regularOpen;
    if(state.regularOpen)liveMarkets.any=true;
  });
  // Prepend live-search instruction if any watched market is open
  if(liveMarkets.any){
    var liveNames=[];
    if(liveMarkets.US&&mktsToShow.indexOf('US')!==-1) liveNames.push('US equities');
    if(liveMarkets.SG&&mktsToShow.indexOf('SG')!==-1) liveNames.push('Singapore (SGX)');
    if(liveMarkets.HK&&mktsToShow.indexOf('HK')!==-1) liveNames.push('Hong Kong (HKEX)');
    if(liveNames.length){
      prompt='LIVE SESSION IN PROGRESS for: '+liveNames.join(', ')+'.\n'
        +'Use web search to find the latest news and catalysts driving markets RIGHT NOW — '
        +'macro data releases today, central bank commentary, earnings, geopolitical events, sector moves. '
        +'Analyse the intraday price action in context of what you find. '
        +'Do NOT reference yesterday or the previous session for live markets — focus on what is happening today.\n\n'
        +prompt;
    }
  }
  // Further Reading instruction — placed early so searches happen before budget runs out
  prompt+=(function(){
    var _today=new Date();
    var _yy=_today.getFullYear();
    var _mm=String(_today.getMonth()+1).padStart(2,'0');
    var _dd=String(_today.getDate()).padStart(2,'0');
    var _ymd=_yy+'/'+_mm+'/'+_dd;
    var _dateStr=_yy+'-'+_mm+'-'+_dd;
    return 'STEP 1 — Do these 3 searches NOW and remember the URLs:\n'
      +'Search A: Search Google for "us stock market today yahoo finance" — find the most recent finance.yahoo.com/news/live/stock-market-today-* article. Remember this URL.\n'
      +'Search B: Search "cnbc stock market today '+_dateStr+'" — find the most recent cnbc.com market recap URL. Remember this URL.\n'
      +'Search C: Search "site:minichart.com.sg market '+_dateStr+'" — find the minichart.com.sg article URL. Remember this URL.\n'
      +'STEP 2 — Write the full market analysis sections.\n'
      +'STEP 3 — After the analysis, output the 📰 Further Reading section using the COMPLETE FULL URLs from Step 1 — do not shorten, truncate or modify the URLs in any way:\n'
      +'Yahoo Finance Stock Market Today: [URL from Search A, fallback: https://finance.yahoo.com/topic/stock-market-news/]\n'
      +'CNBC Daily Market Recap: [URL from Search B, fallback: https://www.cnbc.com/markets/]\n'
      +'SGX Market Recap: [URL from Search C, fallback: https://www.minichart.com.sg]\n'
      +'HK Market Daily: https://tradingeconomics.com/hong-kong/stock-market\n'
      +'You MUST output all 4 links. Use fallback only if search found nothing.\n\n';
  })();
  mktsToShow.forEach(function(mkt){
    var d=mktData.filter(function(x){return x.mkt===mkt;});
    if(!d.length)return;
    var state=marketStates[mkt];
    var isLive=state.regularOpen;
    var sgTime=summaryNow.toLocaleTimeString('en-SG',{timeZone:'Asia/Singapore',hour:'2-digit',minute:'2-digit'});
    var dateStr;
    if(isLive){
      dateStr='LIVE as of '+sgTime+' SGT';
    } else {
      var completedDate=MarketBrief.marketData.getLatestCompletedRegularSessionDate(mkt,summaryNow);
      dateStr=new Intl.DateTimeFormat('en-SG',{timeZone:'UTC',weekday:'long',year:'numeric',month:'long',day:'numeric'}).format(new Date(completedDate+'T00:00:00Z'));
    }
    var sessionCtx=isLive?'(session in progress — intraday data)':'(last close)';
    prompt+=sectionLabels[mkt]+' data '+sessionCtx+' '+dateStr+':\n'
      +d.map(function(x){return x.name+': '+fmt(x.price)+' '+fmtP(x.pct);}).join('\n')+'\n\n';
    sections.push({label:sectionLabels[mkt],date:dateStr,live:isLive});
  });
  // ── Watchlist data for prompt ──
  var watchTickers=mktData.filter(function(x){return !FIXED_SYMS[x.sym];});
  var watchLines='';
  if(watchTickers.length){
    watchLines='MY WATCHLIST DATA:\n';
    watchTickers.forEach(function(x){
      var arr=x.pct>=0?'▲':'▼';
      watchLines+=x.name+' ('+x.sym+'): '+fmt(x.price)+' '+arr+' '+fmtD(x.chg)+' ('+fmtP(x.pct)+')\n';
    });
    watchLines+='\n';
  }
  prompt+=watchLines;

  // ── Fetch regional indices ──
  var regionalSyms=['^KS11','^KLSE','^TWII','^N225'];
  var regionalNames={'^KS11':'KOSPI (South Korea)','^KLSE':'Bursa Malaysia (KLCI)','^TWII':'TAIEX (Taiwan)','^N225':'Nikkei 225 (Japan)'};
  var regionalLines='REGIONAL MARKETS DATA (fetched live):\n';
  console.log('MB: starting regional fetch');
  try{
    var regResults=await Promise.allSettled(regionalSyms.map(function(sym){return Promise.race([fetchQuote(sym),new Promise(function(_,rej){setTimeout(function(){rej(new Error('timeout'));},5000);})]);  }));
    regResults.forEach(function(r,i){
      var sym=regionalSyms[i];
      if(r.status==='fulfilled'&&r.value&&r.value.price!=null){
        var d=r.value;
        var arr=d.pct>=0?'▲':'▼';
        regionalLines+=regionalNames[sym]+': '+fmt(d.price)+' '+arr+' '+fmtD(d.chg)+' ('+fmtP(d.pct)+')\n';
      } else {
        regionalLines+=regionalNames[sym]+': data unavailable\n';
      }
    });
  } catch(e){
    regionalLines+='(regional data fetch failed)\n';
  }
  regionalLines+='\n';
  console.log('MB: regional fetch done');
  console.log('MB: regionalLines=',regionalLines);
  prompt+=regionalLines;

  var headerList=sections.map(function(s,i){return (i+1)+'. '+s.label+' ('+(s.live?'🔴 LIVE':''+s.date)+')';}).join('\n');
  var sectionCount=sections.length;
  if(mktsToShow.length>1) { headerList+='\n'+(++sectionCount)+'. 📊 Overall Sentiment'; }
  if(watchTickers.length)  { headerList+='\n'+(++sectionCount)+'. 💼 My Watchlist'; }
  headerList+='\n'+(++sectionCount)+'. 🌏 Regional Markets';
  prompt+='Write a structured market summary with EXACTLY these section headers (use them verbatim):\n'
    +headerList+'\n\n'+(styleInstr[S.style]||styleInstr.detailed)+'\n'
    +(mktsToShow.length>1?'End the Overall Sentiment section with one line e.g. "Sentiment: Cautiously Bullish".\n':'End with one line e.g. "Sentiment: Cautiously Bullish".\n')
    +'For each market, comment on volume relative to average — was volume elevated, light, or normal? High volume on a move suggests institutional conviction; low volume suggests retail-driven or unconvinced market. Distinguish where possible between institutional (block trades, futures-led, options activity) and retail (momentum-chasing, meme-driven) participation.\n'
    +'Focus on what matters for a Singapore investor.\n\n'
    +(watchTickers.length?(S.style==='bullets'?'For the 💼 My Watchlist section: write 3-4 bullet points starting with - covering overall sentiment and top 2-3 movers by % change with one-line reason each.\\n':'For the 💼 My Watchlist section: assess the overall sentiment of the watchlist (how many stocks are up vs down, breadth). Highlight the top 2-3 movers by % change — name them, give the % move, and one-line reason if identifiable. Keep to 3-4 sentences.\\n'):'')
    +(S.style==='bullets'?'For the 🌏 Regional Markets section: write 3-4 bullet points starting with - summarising the KOSPI, Bursa Malaysia, TAIEX, and Nikkei using ONLY the regional data provided above — do not search for these figures.\\n':'For the 🌏 Regional Markets section: write one paragraph (3-4 sentences) summarising the KOSPI, Bursa Malaysia, TAIEX, and Nikkei using ONLY the regional data provided above — do not search for these figures.\\n')

  var hdrHTML='<div class="sumbox"><div class="sumhdr" style="justify-content:space-between;"><div style="display:flex;align-items:center;gap:8px;"><span class="badge">AI · Claude</span>'
    +'<span class="sumdate" style="margin-left:4px">'+esc(mktsToShow.join(' + '))+' · '+new Date().toLocaleTimeString('en-SG',{timeZone:'Asia/Singapore',hour:'2-digit',minute:'2-digit'})+'</span></div><button class="pdf-btn" data-export="sum" style="background:none;border:1px solid var(--bor);color:var(--mut);border-radius:6px;padding:3px 10px;font-size:0.85rem;cursor:pointer;font-family:DM Mono,monospace;">PDF</button></div>'
    +'<div id="sumStream"><div class="msg">Searching &amp; analysing… <span id="cdNum">~20s</span></div></div></div>';
  setSumHTML(hdrHTML);
  // Find the VISIBLE sumStream — on desktop sumAreaD is shown, on mobile sumArea
  function getStreamEl(){
    var b=document.getElementById('sumAreaD'),a=document.getElementById('sumArea');
    var el=(b&&b.offsetParent!==null)?b.querySelector('#sumStream'):(a?a.querySelector('#sumStream'):null);
    return el||document.getElementById('sumStream');
  }
  var _cdSec=20,_cdFirstToken=false;
  window._sumCdTimer=setInterval(function(){
    _cdSec--;
    var n=document.getElementById('cdNum');
    if(n&&_cdSec>0) n.textContent='~'+_cdSec+'s';
    else if(_cdSec<=0) clearInterval(window._sumCdTimer);
  },1000);
  var accumulated='';
  try{
    console.log('MB: prompt built, length=',prompt.length);
    var resp=await fetch(S.proxyUrl+'/api/quote?claude=1',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:4000,stream:true,tools:[{type:'web_search_20250305',name:'web_search',max_uses:5}],messages:[{role:'user',content:prompt}]})
    });
    console.log('MB: API response status=',resp.status);
    if(!resp.ok){var e=await resp.json().catch(function(){return{};});throw new Error((e.error&&e.error.message)||'API error '+resp.status);}
    console.log('MB: reader loop starting');
    var reader=resp.body.getReader();
    var decoder=new TextDecoder();
    var buf='';
    while(true){
      var _r=await reader.read();
      if(_r.done)break;
      buf+=decoder.decode(_r.value,{stream:true});
      var lines=buf.split('\n');
      buf=lines.pop();
      for(var li=0;li<lines.length;li++){
        var line=lines[li].trim();
        if(!line.startsWith('data:'))continue;
        var json=line.slice(5).trim();
        if(json==='[DONE]')continue;
        try{
          var ev=JSON.parse(json);
          if(ev.type==='content_block_start'&&ev.content_block&&ev.content_block.type==='tool_use'){
            var _cdN=document.getElementById('cdNum');if(_cdN)_cdN.textContent='searching…';}
          if(ev.type==='content_block_delta'&&ev.delta&&ev.delta.type==='text_delta'){
            accumulated+=ev.delta.text;
            var sel=getStreamEl();
            if(!_cdFirstToken){_cdFirstToken=true;clearInterval(window._sumCdTimer);}
              if(sel){sel.innerHTML=formatSummary(cleanAIText(accumulated));
              // Update savedSumHTML - prefer whichever area has more content
              var _sa2a=document.getElementById('sumArea'),_sa2b=document.getElementById('sumAreaD');
              var _sa2=(_sa2b&&(_sa2b.innerHTML||'').length>(_sa2a&&_sa2a.innerHTML||'').length)?_sa2b:_sa2a;
              if(_sa2&&_sa2.innerHTML&&_sa2.innerHTML.length>100) savedSumHTML=_sa2.innerHTML;
            }
          }
        }catch(_){}
      }
    }
    // Final render
    var sel=getStreamEl();
    clearInterval(window._sumCdTimer);
    if(sel)sel.innerHTML=formatSummary(cleanAIText(accumulated));
    _sumInFlight=false;
    setAIBtnVisible(true);
    // Save complete rendered HTML for persistence across tab switches
    var _sa=document.getElementById('sumArea'); var _sb=document.getElementById('sumAreaD');
    var _saLen=(_sa&&_sa.innerHTML)?_sa.innerHTML.length:0;
    var _sbLen=(_sb&&_sb.innerHTML)?_sb.innerHTML.length:0;
    var _best=_sbLen>_saLen?_sb:_sa;
    if(_best&&_best.innerHTML&&_best.innerHTML.length>100) savedSumHTML=_best.innerHTML;
  }catch(e){
    setSumHTML('<div class="msg err">Summary error: '+esc(e.message)+'</div>');
    _sumInFlight=false;
    setAIBtnVisible(true);
  }
}

// ── Strip IV preamble ────────────────────────────────────────────
function stripIVPreamble(txt){
  var markers=['1. 💰','💰 Intrinsic','📈 Price Action','1. 📈','2. 📈','DCF-20:'];
  var earliest=txt.length;
  for(var i=0;i<markers.length;i++){
    var pos=txt.indexOf(markers[i]);
    if(pos!==-1&&pos<earliest) earliest=pos;
  }
  // If marker not yet seen, return empty — suppresses preamble during streaming
  if(earliest===txt.length) return '';
  return txt.slice(earliest);
}

// ── Finnhub Intrinsic Value ──────────────────────────────────────────────────
async function fetchFinnhubValuation(sym, currentPrice){
  if(!S.proxyUrl) return null;
  if(sym.startsWith('^')) return null;
  try{
    var r=await fetch(S.proxyUrl+'/api/quote?finnhub=1&symbol='+encodeURIComponent(sym));
    if(!r.ok) throw new Error('HTTP '+r.status);
    var d=await r.json();
    if(!d.metric) throw new Error('No metric data');
    var m=d.metric;
    // DCF-20: operating cash flow per share
    var ocfps = m.cashFlowPerShareTTM||m.cashFlowPerShareAnnual||null;
    // DFCF-20: true free cash flow per share = price / pfcfShareTTM
    var pfcf  = m.pfcfShareTTM||m.pfcfShareAnnual||null;
    var fcfps = (pfcf&&pfcf>0&&currentPrice>0)?(currentPrice/pfcf):null;
    // DNI-20: discounted net income using EPS
    var eps   = m.epsBasicExclExtraItemsTTM||m.epsTTM||m.epsNormalizedAnnual||null;
    // Forward P/E IV
    var fwdPE = m.forwardPE||null;
    var epsNri= m.epsExclExtraItemsTTM||m.epsBasicExclExtraItemsTTM||null;
    // Growth rate — Finnhub returns as percentage (12.24 = 12.24%), divide by 100
    var growthRate=0.08;
    var g3=m.epsGrowth3Y||null, g5=m.epsGrowth5Y||null;
    if(g3&&g3>0) growthRate=Math.min(Math.max(g3/100,0.03),0.15);
    else if(g5&&g5>0) growthRate=Math.min(Math.max(g5/100,0.03),0.15);
    var disc=0.10, termG=0.03;
    function dcf20(e,g){
      if(!e||e<=0) return null;
      var pv=0,ev=e;
      for(var yr=1;yr<=10;yr++){ev*=(1+g);pv+=ev/Math.pow(1+disc,yr);}
      var ev2=ev;
      for(var yr2=11;yr2<=20;yr2++){ev2*=(1+g/2);pv+=ev2/Math.pow(1+disc,yr2);}
      // Gordon Growth terminal value
      var terminal=(ev2*(1+termG)/(disc-termG))/Math.pow(1+disc,20);
      return pv+terminal;
    }
    var dcf   = dcf20(ocfps, growthRate);  // DCF-20: operating cash flow
    var dfcf  = dcf20(fcfps, growthRate);  // DFCF-20: free cash flow
    var dni   = dcf20(eps,   growthRate);  // DNI-20: net income (EPS)
    var fwdiv = (fwdPE&&epsNri&&fwdPE>0&&epsNri>0)?(fwdPE*epsNri):null;
    var valid=[dcf,dfcf,dni].filter(function(v){return v&&v>0;});
    if(!valid.length) return null;
    var mbVal=valid.reduce(function(a,b){return a+b;},0)/valid.length;
    var mos=currentPrice>0?((mbVal-currentPrice)/mbVal*100):null;
    var verdict=mos===null?'N/A':mos>20?'Undervalued':mos<-20?'Overvalued':'Fairly Valued';
    function f3(v){return v?'$'+v.toFixed(3):'N/A';}
    function fp(v){return v!==null?(v>=0?'+':'')+v.toFixed(1)+'%':'N/A';}
    var hasNA=[dcf,dfcf,dni,fwdiv].some(function(v){return !v||v<=0;});
    var naWarn=hasNA?'\n⚠ Some components are N/A — MB Value is based on partial data and may not be accurate.':'';
    return 'DCF-20: '+f3(dcf)+' | DFCF-20: '+f3(dfcf)+' | DNI-20: '+f3(dni)+'\n'
      +'Fwd P/E: '+f3(fwdiv)+'\n'
      +'MB Value: '+f3(mbVal)+' | Current Price: '+(currentPrice?fmt(currentPrice):'N/A')+' | Margin of Safety: '+fp(mos)+' | Verdict: '+verdict+'\n'
      +'_Generated with Finnhub data_'
      +naWarn;
  }catch(e){
    console.warn('Finnhub valuation failed:',e.message||e);
    return null;
  }
}


// ── Ticker AI (manual button) ─────────────────────────────────────────────────
async function genTickerAI(sym,d,resId){
  var el=document.getElementById('tai_'+resId);
  if(!el)return;
  var _tcdSec=15,_tcdFirst=false;
  el.innerHTML='<div class="msg">Analysing… <span id="tcdNum_'+resId+'">~'+_tcdSec+'s</span></div>';
  var _tcdTimer=setInterval(function(){
    _tcdSec--;
    var n=document.getElementById('tcdNum_'+resId);
    if(n&&_tcdSec>0) n.textContent='~'+_tcdSec+'s';
    else if(_tcdSec<=0) clearInterval(_tcdTimer);
  },1000);
  // Always fetch the freshest quote right now for accuracy
  var liveData=d;
  try{ liveData=await fetchQuote(sym); }catch(e){}
  var now=new Date();
  // Always use SGT for display date — this is a Singapore investor tool
  var dateStr=now.toLocaleDateString('en-SG',{timeZone:'Asia/Singapore',weekday:'long',year:'numeric',month:'long',day:'numeric'});
  var dayOfWeek=now.toLocaleDateString('en-US',{timeZone:'Asia/Singapore',weekday:'long'});
  // Determine prevDay label based on ticker's market
  function getPrevDay(sym){
    var tz='America/New_York';
    if(sym.endsWith('.SI')) tz='Asia/Singapore';
    else if(sym.endsWith('.HK')) tz='Asia/Hong_Kong';
    var openMin=tz==='Asia/Singapore'?540:570;
    var closeMin=tz==='Asia/Singapore'?1020:960;
    var now=new Date();
    var day=now.toLocaleDateString('en-US',{timeZone:tz,weekday:'long'});
    var h=parseInt(now.toLocaleString('en-US',{timeZone:tz,hour:'numeric',hour12:false}));
    var m=parseInt(now.toLocaleString('en-US',{timeZone:tz,minute:'numeric'}));
    var mins=h*60+m;
    var sessionOpen=mins>=openMin&&mins<closeMin;
    // Rules:
    // Weekend → Friday
    // Monday, session not yet open → Friday
    // Monday, session open or closed → Friday (prev session is always Friday)
    // Tuesday, session not yet open → Friday (Monday hasn't traded yet today, last close = Friday)
    // Tuesday, session open → Monday (trading against Monday's close)
    // Wed-Fri, session not yet open → yesterday (e.g. Wed before open → Tuesday)
    // Wed-Fri, session open or closed → yesterday
    if(day==='Saturday'||day==='Sunday') return 'Friday';
    if(day==='Monday') return 'Friday';
    if(day==='Tuesday'&&!sessionOpen) return 'Friday';
    if(day==='Tuesday'&&sessionOpen) return 'Monday';
    return 'yesterday';
  }
  var prevDay=getPrevDay(sym);
  var name=liveData&&liveData.name?liveData.name:sym;
  var yr=now.getFullYear();
  var priceBlock=liveData?
    'As of '+dateStr+':\n'
    +'  Price: '+fmt(liveData.price)+' '+(liveData.currency||'')+'\n'
    +'  Change from '+prevDay+"'s close ("+fmt(liveData.prev)+'): '+fmtD(liveData.change)+' ('+fmtP(liveData.changePct)+')\n'
    +'  Day High: '+fmt(liveData.high)+' / Day Low: '+fmt(liveData.low)+'\n'
    +'  Volume: '+fmtVol(liveData.volume)
    :'(no price data)';
  var mktTz=(sym.endsWith('.SI')?'Asia/Singapore':sym.endsWith('.HK')?'Asia/Hong_Kong':'America/New_York');
  var mktDateStr=now.toLocaleDateString('en-SG',{timeZone:mktTz,weekday:'long',year:'numeric',month:'long',day:'numeric'});
  // Fetch Finnhub valuation before building prompt
  var finnhubIV=null;
  try{ finnhubIV=await fetchFinnhubValuation(sym, liveData&&liveData.price?liveData.price:0); }catch(e){}

  // finnhubAttempted = Finnhub key set AND ticker is not an index
  var finnhubAttempted=S.proxyUrl&&!sym.startsWith('^');

  var isIndex=sym.startsWith('^');
  var isSGHK=sym.endsWith('.SI')||sym.endsWith('.HK');
  var _sects27='2. 📈 Price Action\n3. 🔍 Key Drivers\n4. 📊 Volume & Participation\n5. ⚠️ Key Risks\n6. 🇸🇬 Singapore Investor Angle\n7. 🔮 Near-Term Outlook';
  var ivSections=(finnhubIV||isIndex)
    ? _sects27
    : '1. 💰 Intrinsic Value\nTwo lines only (all monetary values to 3 decimal places e.g. $12.345):\nDCF-20: $X.XXX | DFCF-20: $X.XXX | DNI-20: $X.XXX\nMB Value: $X.XXX | Current Price: '+(liveData&&liveData.price?fmt(liveData.price):'N/A')+' | Margin of Safety: X% | Verdict: Undervalued/Fairly Valued/Overvalued\n_Generated with search results — IV result may not be accurate_\n\n'+_sects27;

  // If Yahoo was attempted but failed, do not fall back to AI — show unavailable instead
  var ivRule=finnhubIV?''
    :isIndex?''
    :'Search for latest financials for '+sym+' and compute DCF-20 (operating CF/share), DFCF-20 (FCF/share), DNI-20 (diluted EPS) using 10% discount, growth capped 15%, Gordon Growth terminal at 3%. MB Value = average of valid positive values only. Output ONLY the two result lines — no explanation, no working, no commentary.\n\n';

  var prompt='You are a financial analyst covering '+sym+' ('+name+'). Today ('+mktDateStr+'), last session: '+prevDay+'. No title. No **bold**. No pre-'+yr+' events.\n\n'
    +'LIVE PRICE DATA (use these exact figures only — do not use any other source):\n'+priceBlock+'\n\n'
    +ivRule
    +'Write EXACTLY these sections:\n'
    +ivSections+'\n\n'
    +(S.style==='concise'?'STRICT — each section must be exactly 2 sentences, no more. Sentence 1: key move with exact % and number. Sentence 2: single most important driver or catalyst. No sub-labels, no elaboration.'
    :S.style==='bullets'?'3-4 bullet points per section starting with -. First bullet = key point with numbers, remaining bullets = drivers and implications.'
    :'3-4 sentences per section.')
    +' Use "'+prevDay+'" not "yesterday". For Near-Term Outlook make a direct call on likely direction over 5-10 trading days. End with: "Outlook: [one-line verdict]".';
  var finnhubIVHtml=finnhubIV?formatSummary('1. 💰 Intrinsic Value\n'+finnhubIV)
    :isIndex?formatSummary('1. 💰 Intrinsic Value\nUnable to compute without source data — index-level financials unavailable\n_Generated with Finnhub data_')
    :'';
  var tickerHdrHTML='<div class="sumbox" style="margin-top:10px"><div class="sumhdr" style="justify-content:space-between;"><div style="display:flex;align-items:center;gap:8px;"><span class="badge">AI Analysis</span><span class="sumdate" style="margin-left:6px">'+esc(dateStr)+'</span></div><button class="pdf-btn" data-export="tick_'+resId+'" data-name="'+esc(name)+'" style="background:none;border:1px solid var(--bor);color:var(--mut);border-radius:6px;padding:3px 10px;font-size:0.85rem;cursor:pointer;font-family:DM Mono,monospace;">PDF</button></div>'+finnhubIVHtml+'<div id="tickStream_'+resId+'"></div></div>';
  el.innerHTML=tickerHdrHTML;
  function getTickStream(){return document.getElementById('tickStream_'+resId);}
  var accumulated='';
  try{
    console.log('MB: prompt built, length=',prompt.length);
    var resp=await fetch(S.proxyUrl+'/api/quote?claude=1',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:finnhubIV?2000:3000,stream:true,tools:finnhubIV?[]:[{type:'web_search_20250305',name:'web_search',max_uses:2}],messages:[{role:'user',content:prompt}]})});
    console.log('MB: API response status=',resp.status);
    if(!resp.ok){var er=await resp.json().catch(function(){return{};});throw new Error((er.error&&er.error.message)||'API error '+resp.status);}
    var reader=resp.body.getReader(), decoder=new TextDecoder(), buf='';
    function applyPrevDay(t){
      if(prevDay==='yesterday') return t;
      return t.replace(/yesterday[\u2018\u2019\u02bc'`\u2032]s/gi,prevDay+"'s").replace(/yesterday/gi,prevDay);
    }
    while(true){
      var _r=await reader.read(); if(_r.done)break;
      buf+=decoder.decode(_r.value,{stream:true});
      var lines=buf.split('\n'); buf=lines.pop();
      for(var li=0;li<lines.length;li++){
        var ln=lines[li].trim(); if(!ln.startsWith('data:'))continue;
        var json=ln.slice(5).trim(); if(json==='[DONE]')continue;
        try{var ev=JSON.parse(json);
          if(ev.type==='content_block_start'&&ev.content_block&&ev.content_block.type==='tool_use'){
            var _cdN=document.getElementById('cdNum');if(_cdN)_cdN.textContent='searching…';}
          if(ev.type==='content_block_delta'&&ev.delta&&ev.delta.type==='text_delta'){
            accumulated+=ev.delta.text;
            if(!_tcdFirst){_tcdFirst=true;clearInterval(_tcdTimer);var _tcdDiv=document.getElementById('tickCd_'+resId);if(_tcdDiv)_tcdDiv.style.display='none';}
            if(ev.delta.text.indexOf('\n')!==-1){
              var ts=getTickStream();
              if(ts) ts.innerHTML=formatSummary(cleanAIText(applyPrevDay(accumulated)));
            }
          }
        }catch(_){}
      }
    }
    clearInterval(_tcdTimer);
    var _tcd2=document.getElementById('tickCd_'+resId);if(_tcd2)_tcd2.style.display='none';
    var _disc='\n\n---\n_This analysis is AI-generated for informational purposes only. Not financial advice. Do your own research before investing._';
    var ts=getTickStream(); if(ts){ts.innerHTML=formatSummary(cleanAIText(applyPrevDay(accumulated))+_disc);if(accumulated.trim())storeTickerAIRecord(sym,'ticker-analysis',el.innerHTML,resId);}
    // Save with slight delay to ensure DOM is fully updated
    setTimeout(function(){
      var _tr=document.getElementById('tickRes')||document.getElementById('tickResD');
      if(_tr&&_tr.innerHTML&&_tr.innerHTML.length>200) savedSearchHTML=_tr.innerHTML;
    },100);
  }catch(e){
    el.innerHTML='<div class="msg err">Analysis error: '+esc(e.message)+'</div>';
  }
}


// ── About AI (company summary) ────────────────────────────────────────────────
async function triggerAboutAI(sym,resId,btn,companyName){
  var key=normalizeTickerAISymbol(sym),kind='ticker-about';
  if(MarketBrief.searchAI.inFlight[resId])return;
  var cached=getTickerAIRecord(key,kind);
  if(cached){renderTickerAIRecord(cached,resId);return;}
  var el=document.getElementById('tai_'+resId); if(!el)return;
  MarketBrief.searchAI.inFlight[resId]={kind:kind,symbol:key};
  setTickerAIButtonsBusy(resId,true,kind);
  var _acdSec=12,_acdFirst=false;
  el.innerHTML='<div class="msg">Loading overview… <span id="acdNum_'+resId+'">~'+_acdSec+'s</span></div>';
  var _acdTimer=setInterval(function(){
    _acdSec--;
    var n=document.getElementById('acdNum_'+resId);
    if(n&&_acdSec>0) n.textContent='~'+_acdSec+'s';
    else if(_acdSec<=0) clearInterval(_acdTimer);
  },1000);
  var name=sym;
  var displayName=companyName&&companyName!==sym?companyName:sym;
  var aboutHdr='<div class="sumbox" style="margin-top:10px">'+'<div class="sumhdr" style="justify-content:space-between;">'+'<div style="display:flex;align-items:center;gap:8px;">'+'<span class="badge" style="background:var(--mut);">ℹ About</span>'+'<span class="sumdate" style="margin-left:6px">'+esc(displayName)+' ('+esc(sym)+')</span></div>'+'<button class="pdf-btn" data-export="about_'+resId+'" data-name="'+esc(displayName)+'" '+'style="background:none;border:1px solid var(--bor);color:var(--mut);border-radius:6px;padding:3px 10px;font-size:0.85rem;cursor:pointer;font-family:DM Mono,monospace;">PDF</button></div>'
    +'<div id="aboutCd_'+resId+'" class="msg">Loading overview… <span id="acdNum_'+resId+'">~12s</span></div>'
    +'<div id="aboutStream_'+resId+'"></div></div>';
  el.innerHTML=aboutHdr;
  function getAboutStream(){return document.getElementById('aboutStream_'+resId);}
  var accumulated='';
  try{
    var prompt='Search for "'+sym+'" ('+displayName+') and write a concise factual overview. '
      +'Go straight into describing the company — do NOT start with a sentence like "X is the ticker for Y" or restate the company name as an opener. '
      +'Cover: what the company does, exchange and sector, market cap tier, and 2-3 things a Singapore investor should know (dividends, key risks, revenue drivers). '
      +'Be specific and factual. Write in plain English. No markdown bold (**) or headers.'
    console.log('MB: prompt built, length=',prompt.length);
    var resp=await fetch(S.proxyUrl+'/api/quote?claude=1',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1000,stream:true,tools:[{type:'web_search_20250305',name:'web_search',max_uses:2}],messages:[{role:'user',content:prompt}]})});
    console.log('MB: API response status=',resp.status);
    if(!resp.ok){var er=await resp.json().catch(function(){return{};});throw new Error((er.error&&er.error.message)||'API error '+resp.status);}
    var reader=resp.body.getReader(),decoder=new TextDecoder(),buf='';
    while(true){
      var _r=await reader.read(); if(_r.done)break;
      buf+=decoder.decode(_r.value,{stream:true});
      var lines=buf.split('\n'); buf=lines.pop();
      for(var li=0;li<lines.length;li++){
        var ln=lines[li].trim(); if(!ln.startsWith('data:'))continue;
        var json=ln.slice(5).trim(); if(json==='[DONE]')continue;
        try{var ev=JSON.parse(json);
          if(ev.type==='content_block_start'&&ev.content_block&&ev.content_block.type==='tool_use'){
            var _cdN=document.getElementById('cdNum');if(_cdN)_cdN.textContent='searching…';}
          if(ev.type==='content_block_delta'&&ev.delta&&ev.delta.type==='text_delta'){
            accumulated+=ev.delta.text;
            if(!_acdFirst){_acdFirst=true;clearInterval(_acdTimer);var _acdDiv=document.getElementById('aboutCd_'+resId);if(_acdDiv)_acdDiv.style.display='none';}
            var ts=getAboutStream();
            if(ts) ts.innerHTML=formatSummary(cleanAIText(accumulated));
          }
        }catch(_){}
      }
    }
    clearInterval(_acdTimer);
    var _acd2=document.getElementById('aboutCd_'+resId);if(_acd2)_acd2.style.display='none';
    var ts=getAboutStream(); if(ts){ts.innerHTML=formatSummary(cleanAIText(accumulated));if(accumulated.trim())storeTickerAIRecord(key,kind,el.innerHTML,resId);}
    setTimeout(function(){
      var _tr=document.getElementById('tickRes')||document.getElementById('tickResD');
      if(_tr&&_tr.innerHTML&&_tr.innerHTML.length>200) savedSearchHTML=_tr.innerHTML;
    },100);
  }catch(e){
    el.innerHTML='<div class="msg err">Error: '+esc(e.message)+'</div>';
  }finally{
    clearInterval(_acdTimer);
    delete MarketBrief.searchAI.inFlight[resId];
    setTickerAIButtonsBusy(resId,false,kind);
  }
}
// ── PDF Export ─────────────────────────────────────────────────────
function exportToPDF(type){
  var contentEl=null, title='MarketBrief';
  if(type==='sum'){
    var a=document.getElementById('sumArea'),b=document.getElementById('sumAreaD');
    contentEl=(b&&b.offsetParent!==null)?b:a;
    title='MarketBrief AI Summary';
  } else if(type.indexOf('tick_')===0){
    var resId=type.slice(5);
    contentEl=document.getElementById('tai_'+resId);
    title='MarketBrief Analysis';
  } else if(type.indexOf('about_')===0){
    var resId=type.slice(6);
    contentEl=document.getElementById('tai_'+resId);
    title='About';
  } else if(type.indexOf('invest_')===0){
    var pid=type.slice(7);
    contentEl=document.getElementById('invResult_'+pid);
    title='MarketBrief Investment Ideas';
  }

  var btn=document.querySelector('.pdf-btn[data-export="'+type+'"]');
  if(btn){
    var compName=btn.getAttribute('data-name')||'';
    if(compName) title=title+' — '+compName;
    btn.disabled=true;
  }

  var now=new Date();
  var ds=now.toLocaleDateString('en-SG',{timeZone:'Asia/Singapore',year:'numeric',month:'short',day:'numeric'});
  var ts=now.toLocaleTimeString('en-SG',{timeZone:'Asia/Singapore',hour:'2-digit',minute:'2-digit'});

  var html=contentEl.innerHTML
    .replace(/color:var\(--acc\)/g,'color:#005b8e')
    .replace(/color:var\(--orange\)/g,'color:#7c2d00')
    .replace(/color:var\(--txt\)/g,'color:#111111')
    .replace(/color:var\(--mut\)/g,'color:#444444')
    .replace(/color:var\(--grn\)/g,'color:#146b3a')
    .replace(/color:var\(--red\)/g,'color:#b91c1c')
    .replace(/color:var\(--gld\)/g,'color:#92610a')
    .replace(/color:var\(--bg\)/g,'color:#000000')
    .replace(/background:linear-gradient[^;"]+/g,'background:#f0f4ff')
    .replace(/background:rgba\(0,212,255[^)]*\)/g,'background:#e8f4fb')
    .replace(/background:rgba\(124,58,237[^)]*\)/g,'background:#f0eeff')
    .replace(/background:rgba\(16,185,129[^)]*\)/g,'background:#e8f8f0')
    .replace(/background:rgba\(100,116,139[^)]*\)/g,'background:#f0f0f0')
    .replace(/background:rgba\([^)]*\)/g,'background:#f5f5f5')
    .replace(/border-left:3px solid var\(--acc\)/g,'border-left:3px solid #005b8e')
    .replace(/border-bottom:1px solid rgba\(249,115,22[^)]*\)/g,'border-bottom:1px solid #c07040')
    .replace(/border-top:1px solid var\(--bor\)/g,'border-top:1px solid #cccccc')
    .replace(/border:1px solid var\(--bor\)/g,'border:1px solid #cccccc')
    .replace(/border:1px solid rgba\(0,212,255[^)]*\)/g,'border:1px solid #a0cce0')
    .replace(/border:1px solid rgba\([^)]*\)/g,'border:1px solid #dddddd');

  // Strip UI elements and font-family before passing to pdfmake
  var _tmpDiv=document.createElement('div');
  _tmpDiv.innerHTML=html;
  // Remove PDF buttons
  _tmpDiv.querySelectorAll('.pdf-btn').forEach(function(el){el.remove();});
  // Remove sumhdr (AI Analysis header bar)
  _tmpDiv.querySelectorAll('.sumhdr').forEach(function(el){el.remove();});
  var htmlClean=_tmpDiv.innerHTML.replace(/font-family:[^;"']+[;"']/g,function(m){return m.slice(-1);});
  var wrappedHtml='<div>'+htmlClean+'</div>';

  function loadScript(src,cb){
    if(document.querySelector('script[src="'+src+'"]')){cb();return;}
    var s=document.createElement('script');s.src=src;
    s.onload=function(){cb();};
    s.onerror=function(){
      console.error('Failed to load:',src);
      if(btn){btn.textContent='PDF';btn.disabled=false;}
    };
    document.head.appendChild(s);
  }

  loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/pdfmake.min.js',function(){
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/vfs_fonts.min.js',function(){
      loadScript('https://cdn.jsdelivr.net/npm/html-to-pdfmake@latest/browser.js',function(){
        try{
          if(!window.htmlToPdfmake){throw new Error('htmlToPdfmake not loaded');}
          if(!window.pdfMake){throw new Error('pdfMake not loaded');}
          var converted=window.htmlToPdfmake(wrappedHtml,{window:window});
          var fname=title.replace(/[^a-zA-Z0-9 ]/g,'_').replace(/\s+/g,'_').toLowerCase()+'.pdf';
          var docDef={
            pageSize:'A4',
            pageMargins:[40,70,40,50],
            header:function(){
              return {
                columns:[
                  {stack:[{text:[{text:'Market',bold:true,color:'#003366'},{text:'Brief',bold:true,color:'#005b8e'}],fontSize:13}],margin:[40,15,0,0]},
                  {text:title+' · '+ds+' '+ts+' SGT',fontSize:8,color:'#444444',alignment:'right',margin:[0,18,40,0]}
                ]
              };
            },
            footer:function(cur,total){
              return {text:'Page '+cur+' of '+total,fontSize:8,color:'#888888',alignment:'center',margin:[0,8,0,0]};
            },
            content:[
              {text:title,fontSize:16,bold:true,color:'#003366',marginBottom:4,marginTop:4},
              {canvas:[{type:'line',x1:0,y1:0,x2:515,y2:0,lineWidth:1,lineColor:'#cccccc'}],marginBottom:12}
            ].concat(converted),
            defaultStyle:{fontSize:10,lineHeight:1.4},
            styles:{
              html_h1:{fontSize:14,bold:true,color:'#003366',marginBottom:6,marginTop:10},
              html_h2:{fontSize:12,bold:true,color:'#005b8e',marginBottom:4,marginTop:8},
              html_strong:{bold:true,color:'#003366'},
              html_a:{color:'#005b8e',decoration:'underline'}
            }
          };
          window.pdfMake.createPdf(docDef).download(fname);
        }catch(err){
          console.error('PDF error:',err);
          alert('PDF error: '+err.message);
        }
        if(btn){btn.textContent='PDF';btn.disabled=false;}
      });
    });
  });
}




async function genInvestAI(pid, mkt, budgetSGD, strategy){
  var resEl=document.getElementById('invResult_'+pid);
  var btn=document.getElementById('invBtn_'+pid);
  var mktLabel={'US':'🇺🇸 US (NYSE/Nasdaq)','SG':'🇸🇬 Singapore (SGX)','HK':'🇭🇰 Hong Kong (HKEX)'}[mkt]||mkt;
  var fxNote={'US':'Convert SGD to USD at current rate for position sizing.','SG':'SGX stocks are priced in SGD — use budget directly.','HK':'Convert SGD to HKD at current rate for position sizing.'}[mkt]||'';

  // Gather watchlist tickers for this market
  var watchTickers=(S.customTickers[mkt]||[]).map(function(t){return t.sym+' ('+t.name+')';});
  var watchStr=watchTickers.length?'User already holds or watches these '+mkt+' tickers: '+watchTickers.join(', ')+'. Consider these alongside new ideas.':'No existing watchlist tickers for this market.';

  var cdSec=25, cdFirst=false;
  savedInvestHTML='';
  resEl.innerHTML='<div class="sumbox" style="margin-top:12px"><div class="sumhdr" style="justify-content:space-between;"><div style="display:flex;align-items:center;gap:8px;"><span class="badge">AI · Claude</span><span class="sumdate" style="margin-left:8px">'+mktLabel+' · '+strategy+' · SGD '+budgetSGD.toLocaleString()+'</span></div><button class="pdf-btn" data-export="invest_'+pid+'" data-name="'+esc(mktLabel+' · '+strategy+' · SGD '+budgetSGD.toLocaleString())+'" style="background:none;border:1px solid var(--bor);color:var(--mut);border-radius:6px;padding:3px 10px;font-size:0.85rem;cursor:pointer;font-family:DM Mono,monospace;">PDF</button></div><div id="invStream_'+pid+'"><div class="msg">Searching &amp; analysing… <span id="invCd_'+pid+'">~'+cdSec+'s</span></div></div></div>';

  var cdTimer=setInterval(function(){
    cdSec--;
    var n=document.getElementById('invCd_'+pid);
    if(n&&cdSec>0) n.textContent='~'+cdSec+'s';
    else if(cdSec<=0) clearInterval(cdTimer);
  },1000);

  function getStream(){return document.getElementById('invStream_'+pid);}

  var prompt='You are a financial advisor helping a Singapore-based investor allocate SGD '+budgetSGD.toLocaleString()+' into '+mktLabel+' stocks.\n'
    +'Strategy: '+strategy+' investing.\n'
    +watchStr+'\n'
    +fxNote+'\n\n'
    +'Search the web for the best current '+strategy+' stock opportunities in '+mktLabel+'. '
    +'Consider both the user\'s existing watchlist tickers AND other strong candidates in the market.\n\n'
    +'For each recommended stock, provide:\n'
    +'- Stock name and ticker\n'
    +'- Why this stock fits the '+strategy+' strategy\n'
    +'- Expected outcome (realistic, not overly optimistic)\n\n'
    +'After the individual stock writeups, output a Summary Allocation table in this exact markdown format:\n'
    +'| Stock | Ticker | Allocation (SGD) | Shares/Units | % of Budget |\n'
    +'|-------|--------|-----------------|--------------|-------------|\n'
    +'| ... | ... | ... | ... | ... |\n'
    +'| **Total** | | **SGD X,XXX** | | **XX%** |\n\n'
    +'Use current prices (search if needed) to calculate shares/units. Show total allocated vs SGD '+budgetSGD.toLocaleString()+' budget.';

  var _disclaimer='\n\n---\n_This analysis is AI-generated for informational purposes only. Not financial advice. Market data may be delayed. Always do your own research before making any investment decisions._';

  var accumulated='';
  try{
    var resp=await fetch(S.proxyUrl+'/api/quote?claude=1',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:4000,stream:true,tools:[{type:'web_search_20250305',name:'web_search',max_uses:5}],messages:[{role:'user',content:prompt}]})
    });
    if(!resp.ok){var e=await resp.json().catch(function(){return{};});throw new Error((e.error&&e.error.message)||'API error '+resp.status);}
    var reader=resp.body.getReader(),decoder=new TextDecoder(),buf='';
    while(true){
      var _r=await reader.read(); if(_r.done)break;
      buf+=decoder.decode(_r.value,{stream:true});
      var lines=buf.split('\n'); buf=lines.pop();
      for(var li=0;li<lines.length;li++){
        var ln=lines[li].trim(); if(!ln.startsWith('data:'))continue;
        var json=ln.slice(5).trim(); if(json==='[DONE]')continue;
        try{
          var ev=JSON.parse(json);
          if(ev.type==='content_block_delta'&&ev.delta&&ev.delta.type==='text_delta'){
            accumulated+=ev.delta.text;
            if(!cdFirst){cdFirst=true;clearInterval(cdTimer);var cdDiv=document.getElementById('invCd_'+pid);if(cdDiv)cdDiv.style.display='none';}
            var ts=getStream(); if(ts){ts.innerHTML=formatSummary(cleanAIText(accumulated));var _r=document.getElementById('invResult_'+pid);if(_r&&_r.innerHTML&&_r.innerHTML.length>100)savedInvestHTML=_r.innerHTML;}
          }
        }catch(_){}
      }
    }
    clearInterval(cdTimer);
    var ts=getStream(); if(ts) ts.innerHTML=formatSummary(cleanAIText(accumulated)+_disclaimer);
    var _r=document.getElementById('invResult_'+pid);if(_r&&_r.innerHTML&&_r.innerHTML.length>100)savedInvestHTML=_r.innerHTML;
  }catch(e){
    clearInterval(cdTimer);
    resEl.innerHTML='<div class="msg err">Error: '+esc(e.message)+'</div>';
  }
  btn.disabled=false; btn.textContent='✦ Generate Investment Ideas';
}

// ── Settings ──────────────────────────────────────────────────────────────────
function doChangePIN(pid){
  var cur=document.getElementById('cfgCurPin_'+pid).value||'';
  var nw=document.getElementById('cfgNewPin_'+pid).value||'';
  var cf=document.getElementById('cfgConPin_'+pid).value||'';
  var msg=document.getElementById('pinChgMsg_'+pid);
  changePIN(cur,nw,cf).then(function(result){
    if(result==='ok'){
      msg.innerHTML='<div class="msg ok" style="margin-top:4px">&#x2713; PIN updated.</div>';
      document.getElementById('cfgCurPin_'+pid).value='';
      document.getElementById('cfgNewPin_'+pid).value='';
      document.getElementById('cfgConPin_'+pid).value='';
    } else {
      msg.innerHTML='<div class="msg err" style="margin-top:4px">'+esc(result)+'</div>';
    }
    setTimeout(function(){msg.innerHTML='';},3000);
  });
}


function renderSettingsPanelTo(pid){
  var el=document.getElementById(pid); if(!el)return;

  function mktSection(mkt,flag,label){
    var fixed=S.fixedTickers.filter(function(t){return t.mkt===mkt;});
    var custom=S.customTickers[mkt]||[];
    var fixedHtml=fixed.map(function(t){return '<span class="ttag fixed">🔒 '+esc(t.sym)+'</span>';}).join('');
    var customHtml=custom.map(function(t,i){
      return '<span class="ttag">'
        +'<button class="mv" onclick="moveTicker(\''+mkt+'\','+i+',-1,\''+pid+'\')">↑</button>'
        +'<button class="mv" onclick="moveTicker(\''+mkt+'\','+i+',1,\''+pid+'\')">↓</button>'
        +esc(t.sym)+' <button class="del" onclick="removeTicker(\''+mkt+'\','+i+',\''+pid+'\')">×</button>'
        +'</span>';
    }).join('');
    var iid='settAC_'+mkt+'_'+pid;
    return '<div class="mkt-section">'
      +'<div class="mkt-section-title">'+flag+' '+label+'</div>'
      +'<div class="ticker-tags">'+fixedHtml+customHtml+'</div>'
      +'<div class="tadd-ac-wrap" id="sAcWrap_'+mkt+'_'+pid+'">'
        +'<input class="tadd-ac-input" id="'+iid+'" placeholder="Search to add '+label+' ticker…" autocomplete="off">'
      +'</div>'
      +'</div>';
  }

  el.innerHTML=
    '<div class="srow" style="border-color:rgba(0,212,255,0.4)">'
      +'<div class="slbl" style="color:var(--acc)">★ Proxy URL</div>'
      +'<input class="sinp" type="url" id="cfgProxy_'+pid+'" placeholder="https://mb-proxy.vercel.app" value="'+esc(S.proxyUrl)+'">'
      +'<div class="snote">Your Vercel proxy URL for live market data.</div>'
    +'</div>'

    +'<div class="srow">'
      +'<div class="slbl">Watchlist — by Market</div>'
      +'<div class="snote" style="margin-bottom:12px">🔒 Index tickers are fixed. Use ↑↓ to reorder. Search by name to add.</div>'
      +mktSection('US','🇺🇸','US Stocks')
      +mktSection('SG','🇸🇬','SGX Stocks')
      +mktSection('HK','🇭🇰','HKEX Stocks')
    +'</div>'
    +'<div class="srow">'
      +'<div class="slbl">Summary Style</div>'
      +'<select class="sinp" id="cfgStyle_'+pid+'">'
        +'<option value="detailed"'+(S.style==='detailed'?' selected':'')+'>Detailed paragraph</option>'
        +'<option value="concise"'+(S.style==='concise'?' selected':'')+'>Concise (1 sentence each)</option>'
        +'<option value="bullets"'+(S.style==='bullets'?' selected':'')+'>Bullet points</option>'
      +'</select>'
    +'</div>'
    +'<div class="srow">'
      +'<div class="slbl">Timezone</div>'
      +'<select class="sinp" id="cfgTz_'+pid+'">'
        +'<option value="Asia/Singapore"'+(S.tz==='Asia/Singapore'?' selected':'')+'>Singapore SGT (UTC+8)</option>'
        +'<option value="Asia/Hong_Kong"'+(S.tz==='Asia/Hong_Kong'?' selected':'')+'>Hong Kong HKT (UTC+8)</option>'
        +'<option value="America/New_York"'+(S.tz==='America/New_York'?' selected':'')+'>New York ET</option>'
        +'<option value="UTC"'+(S.tz==='UTC'?' selected':'')+'>UTC</option>'
      +'</select>'
    +'</div>'
    +'<button class="savebtn" onclick="saveSettings(\''+pid+'\')">Save Settings</button>'
    +'<div id="saveMsg_'+pid+'"></div>'
    +'<div class="srow" style="border-color:rgba(0,212,255,0.25)">'
      +'<div class="slbl" style="color:var(--acc)">⇅ Sync Settings</div>'
      +'<div class="snote">Export your settings as a code to copy to another device, or paste a code here to import.</div>'
      +'<button class="savebtn" style="margin-top:8px;background:rgba(0,212,255,0.1);border-color:rgba(0,212,255,0.3);color:var(--acc)" onclick="exportSettings(\''+pid+'\')">⬆ Export Settings Code</button>'
      +'<div id="expOut_'+pid+'"></div>'
      +'<textarea class="sinp" id="impInp_'+pid+'" placeholder="Paste settings code here to import…" rows="3" style="margin-top:10px;font-size:0.8rem;resize:vertical;"></textarea>'
      +'<button class="savebtn" style="margin-top:6px;" onclick="importSettings(\''+pid+'\')">⬇ Import Settings Code</button>'
      +'<div id="impMsg_'+pid+'"></div>'
    +'</div>'
    +'<div class="srow" style="border-color:rgba(0,212,255,0.25)">'
      +'<div class="slbl" style="color:var(--acc)">&#x1F512; Change PIN</div>'
      +'<input class="sinp" type="password" id="cfgCurPin_'+pid+'" placeholder="Current PIN" maxlength="6" style="margin-bottom:8px">'
      +'<input class="sinp" type="password" id="cfgNewPin_'+pid+'" placeholder="New PIN (6 digits)" maxlength="6" style="margin-bottom:8px">'
      +'<input class="sinp" type="password" id="cfgConPin_'+pid+'" placeholder="Confirm new PIN" maxlength="6" style="margin-bottom:8px">'
      +'<button class="savebtn" style="background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.3);color:var(--acc)" onclick="doChangePIN(\''+pid+'\')" >Update PIN</button>'
      +'<div id="pinChgMsg_'+pid+'" style="margin-top:6px"></div>'
    +'</div>'
    +'<div class="srow" style="border-color:rgba(239,68,68,0.2)">'
      +'<div class="slbl" style="color:var(--red)">Disclaimer</div>'
      +'<div class="snote" style="margin:0">Data via Yahoo Finance (15–20 min delay). For informational purposes only — not financial advice.</div>'
    +'</div>';

  // Attach autocomplete to each market add input
  ['US','SG','HK'].forEach(function(mkt){
    var iid='settAC_'+mkt+'_'+pid;
    var wid='sAcWrap_'+mkt+'_'+pid;
    var inp=document.getElementById(iid); if(!inp)return;
    inp.addEventListener('input',function(){
      var v=this.value.trim();
      clearTimeout(acTimers[iid]);
      if(v.length<2){closeSettAcDrop(wid);return;}
      acTimers[iid]=setTimeout(function(){settAcFetch(v,wid,mkt,pid);},320);
    });
    inp.addEventListener('keydown',function(e){
      var drop=document.getElementById('drop_'+wid);
      var items=drop?Array.from(drop.querySelectorAll('.tadd-ac-item')):[];
      var selIdx=-1;
      items.forEach(function(it,i){if(it.classList.contains('sel'))selIdx=i;});
      if(e.key==='ArrowDown'){e.preventDefault();var ni=selIdx<items.length-1?selIdx+1:0;items.forEach(function(it){it.classList.remove('sel');});if(items[ni])items[ni].classList.add('sel');return;}
      if(e.key==='ArrowUp'){e.preventDefault();var pi=selIdx>0?selIdx-1:items.length-1;items.forEach(function(it){it.classList.remove('sel');});if(items[pi])items[pi].classList.add('sel');return;}
      if(e.key==='Enter'){var target=selIdx>=0?items[selIdx]:(items.length?items[0]:null);if(target){addTickerDirect(mkt,target.dataset.sym,target.dataset.name,pid);closeSettAcDrop(wid);var inp2=document.getElementById(iid);if(inp2)inp2.value='';}return;}
      if(e.key==='Escape')closeSettAcDrop(wid);
    });
  });
}

async function settAcFetch(q,wid,mkt,pid){
  if(!S.proxyUrl) return;
  try{
    var r=await fetch(S.proxyUrl+'/api/quote?search='+encodeURIComponent(q));
    var data=await r.json();
    var results=(data.results||[]).slice(0,6);
    renderSettAcDrop(results,wid,mkt,pid);
  }catch(e){ closeSettAcDrop(wid); }
}

function renderSettAcDrop(results,wid,mkt,pid){
  closeSettAcDrop(wid);
  if(!results.length)return;
  // Filter results to only show tickers belonging to the correct market
  var filtered=results.filter(function(r){
    var sym=r.symbol||'';
    if(mkt==='SG') return sym.endsWith('.SI');
    if(mkt==='HK') return sym.endsWith('.HK');
    if(mkt==='US') return !sym.endsWith('.SI')&&!sym.endsWith('.HK')&&!sym.includes('.');
    return true;
  });
  if(!filtered.length)return;
  var drop=document.createElement('div');
  drop.className='tadd-ac-drop'; drop.id='drop_'+wid;
  drop.innerHTML=filtered.map(function(r){
    return '<div class="tadd-ac-item" data-sym="'+esc(r.symbol)+'" data-name="'+esc(r.name)+'">'
      +'<div><div class="tadd-ac-sym">'+esc(r.symbol)+'</div><div class="tadd-ac-name">'+esc(r.name)+'</div></div>'
      +'<div class="tadd-ac-add">+ Add</div>'
      +'</div>';
  }).join('');
  drop.querySelectorAll('.tadd-ac-item').forEach(function(item){
    item.addEventListener('click',function(){
      addTickerDirect(mkt,this.dataset.sym,this.dataset.name,pid);
      closeSettAcDrop(wid);
      var iid='settAC_'+mkt+'_'+pid;
      var inp=document.getElementById(iid); if(inp) inp.value='';
    });
  });
  document.getElementById(wid).appendChild(drop);
}

function closeSettAcDrop(wid){
  var d=document.getElementById('drop_'+wid); if(d) d.remove();
}

function addTickerDirect(mkt,sym,name,pid){
  var all=getAllTickers().map(function(t){return t.sym;});
  if(all.indexOf(sym)>-1)return;
  var flag=sym.endsWith('.L')?'🇬🇧':({'US':'🇺🇸','SG':'🇸🇬','HK':'🇭🇰'}[mkt]||'🌐');
  var sub=sym.endsWith('.L')?'UK · LSE':({'US':'US · NYSE/Nasdaq','SG':'SG · SGX','HK':'HK · HKEX'}[mkt]||'');
  S.customTickers[mkt].push({sym:sym,name:name||sym,sub:sub,flag:flag,mkt:mkt});
  renderSettingsPanelTo(pid);
}

function removeTicker(mkt,idx,pid){ S.customTickers[mkt].splice(idx,1); renderSettingsPanelTo(pid); }
function moveTicker(mkt,idx,dir,pid){
  var arr=S.customTickers[mkt], ni=idx+dir;
  if(ni<0||ni>=arr.length)return;
  var tmp=arr[idx];arr[idx]=arr[ni];arr[ni]=tmp;
  renderSettingsPanelTo(pid);
}

function exportSettings(pid){
  var pinH='';
try{pinH=localStorage.getItem('mb_pin_hash')||'';}catch(e){}
  var data={proxyUrl:S.proxyUrl,style:S.style,tz:S.tz,customTickers:S.customTickers,pinHash:pinH};
  var code=btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  var out=document.getElementById('expOut_'+pid);
  var codeId='expCode_'+pid;
  var btnId='expCopyBtn_'+pid;
  out.innerHTML='<div style="margin-top:8px"><textarea class="sinp" rows="3" id="'+codeId+'" style="font-size:0.75rem;resize:none;" readonly>'+code+'</textarea>'
    +'<button class="savebtn" id="'+btnId+'" style="margin-top:4px;background:rgba(0,212,255,0.1);border-color:rgba(0,212,255,0.3);color:var(--acc)">Copy Code</button></div>';
  document.getElementById(btnId).onclick=function(){
    var t=document.getElementById(codeId); t.select(); t.setSelectionRange(0,99999);
    try{navigator.clipboard.writeText(t.value);}catch(e){document.execCommand('copy');}
    this.textContent='✓ Copied!';
    setTimeout(function(){document.getElementById(btnId).textContent='Copy Code';},2000);
  };
}
function importSettings(pid){
  var msg=document.getElementById('impMsg_'+pid);
  var raw=(document.getElementById('impInp_'+pid).value||'').trim();
  if(!raw){msg.innerHTML='<div class="msg err" style="margin-top:6px">Paste a settings code first.</div>';setTimeout(function(){msg.innerHTML='';},3000);return;}
  try{
    var data=JSON.parse(decodeURIComponent(escape(atob(raw))));
    if(data.proxyUrl!==undefined) S.proxyUrl=data.proxyUrl;
    if(data.style!==undefined)    S.style=data.style;
    if(data.pinHash){try{localStorage.setItem('mb_pin_hash',data.pinHash);}catch(e){}}
    if(data.tz!==undefined)       S.tz=data.tz;
    if(data.customTickers)        S.customTickers=data.customTickers;
    storeSave({proxyUrl:S.proxyUrl,style:S.style,tz:S.tz,customTickers:S.customTickers});
    msg.innerHTML='<div class="msg ok" style="margin-top:6px">✓ Settings imported! Reloading…</div>';
    setTimeout(function(){location.reload();},1200);
  }catch(e){
    msg.innerHTML='<div class="msg err" style="margin-top:6px">Invalid code. Please try again.</div>';
    setTimeout(function(){msg.innerHTML='';},3000);
  }
}
function storeSave(data){
  var str=JSON.stringify(data);
  try{ localStorage.setItem('mb5',str); return 'local'; }catch(e){}
  try{ sessionStorage.setItem('mb5',str); return 'session'; }catch(e){}
  return 'memory';
}
function storeLoad(){
  try{ var v=localStorage.getItem('mb5'); if(v) return JSON.parse(v); }catch(e){}
  try{ var v=sessionStorage.getItem('mb5'); if(v) return JSON.parse(v); }catch(e){}
  return {};
}
function saveSettings(pid){
  S.proxyUrl=(document.getElementById('cfgProxy_'+pid).value||'').trim().replace(/\/+$/,'');
  S.style   =document.getElementById('cfgStyle_'+pid).value;
  S.tz      =document.getElementById('cfgTz_'+pid).value;
  var result=storeSave({proxyUrl:S.proxyUrl,style:S.style,tz:S.tz,customTickers:S.customTickers});
  var m=document.getElementById('saveMsg_'+pid);
  if(result==='memory'){
    m.innerHTML='<div class="msg err" style="margin-top:6px">⚠ Storage blocked by browser — settings saved for this session only. Check Safari Settings → Privacy and disable Private Browsing or allow website data.</div>';
    setTimeout(function(){m.innerHTML='';},6000);
  } else {
    m.innerHTML='<div class="msg ok" style="margin-top:6px">✓ Saved'+(result==='session'?' (session only)':'')+'.</div>';
    setTimeout(function(){m.innerHTML='';},2000);
  }
}
function loadSettings(){
  try{
    var s=storeLoad();
    if(s.proxyUrl) S.proxyUrl=s.proxyUrl;
    if(s.style)    S.style=s.style;
    if(s.tz)       S.tz=s.tz;
    if(s.customTickers)['US','SG','HK'].forEach(function(m){if(s.customTickers[m])S.customTickers[m]=s.customTickers[m];});
  }catch(e){}
}
