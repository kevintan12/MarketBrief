// ── Search Box with Autocomplete ──────────────────────────────────────────────
function getSearchSessionPresentation(sym){
  var state=MarketBrief.marketData.getSessionState(sym);
  var labels={
    preMarket:'Pre-Market',
    regular:'Trading',
    postMarket:'After-Hours',
    regularMorning:'Trading',
    lunchBreak:'Lunch Break',
    regularAfternoon:'Trading',
    closed:'Closed'
  };
  return {state:state,label:labels[state.session]||'Closed',active:state.quoteExpectedToMove};
}

function refreshSearchSessionPresentation(sym){
  if(!sym)return;
  var sessionPresentation=getSearchSessionPresentation(sym);
  ['tickRes','tickResD'].forEach(function(resId){
    var badge=document.getElementById('tradeBadge_'+resId);
    if(!badge)return;
    badge.style.background=sessionPresentation.active?'rgba(16,185,129,0.15)':'rgba(100,116,139,0.15)';
    badge.style.borderColor=sessionPresentation.active?'rgba(16,185,129,0.4)':'var(--bor)';
    badge.style.color=sessionPresentation.active?'var(--grn)':'var(--mut)';
    badge.innerHTML=(sessionPresentation.active?'<span class="dot" style="margin-right:0"></span>':'')+sessionPresentation.label;
  });
}

function renderSearchBox(boxId, resId){
  var el=document.getElementById(boxId); if(!el)return;
  var iid='ac_'+boxId;
  el.innerHTML=
    '<div class="ac-wrap" id="acWrap_'+boxId+'">'
      +'<span class="ac-icon">⌕</span>'
      +'<input class="ac-input" id="'+iid+'" placeholder="Type company name or ticker…" autocomplete="off" spellcheck="false">'
      +'<span class="ac-spinner" id="acSpin_'+boxId+'" style="display:none"><span class="spin"></span></span>'
    +'</div>'
    +'<button class="sbtn" id="sBtn_'+boxId+'" onclick="execSearch(\''+iid+'\',\'sBtn_'+boxId+'\',\''+resId+'\')" style="margin-top:8px">Search</button>';

  var inp=document.getElementById(iid);
  inp.addEventListener('input',function(){ acOnInput(this,boxId,resId); });
  inp.addEventListener('keydown',function(e){
    var drop=document.getElementById('acDrop_'+boxId);
    var items=drop?Array.from(drop.querySelectorAll('.ac-item')):[];
    var selIdx=-1;
    items.forEach(function(it,i){if(it.classList.contains('sel')) selIdx=i;});
    if(e.key==='ArrowDown'){
      e.preventDefault();
      var nextIdx=selIdx<items.length-1?selIdx+1:0;
      items.forEach(function(it){it.classList.remove('sel');});
      if(items[nextIdx]) items[nextIdx].classList.add('sel');
      return;
    }
    if(e.key==='ArrowUp'){
      e.preventDefault();
      var prevIdx=selIdx>0?selIdx-1:items.length-1;
      items.forEach(function(it){it.classList.remove('sel');});
      if(items[prevIdx]) items[prevIdx].classList.add('sel');
      return;
    }
    if(e.key==='Enter'){
      // If a highlighted item exists, select it; else use first item
      var target=selIdx>=0?items[selIdx]:(items.length?items[0]:null);
      if(target){
        var sym=target.dataset.sym;
        if(sym){ document.getElementById(iid).value=sym; closeAcDrop(boxId); execSearch(iid,'sBtn_'+boxId,resId); return; }
      }
      closeAcDrop(boxId); execSearch(iid,'sBtn_'+boxId,resId);
    }
    if(e.key==='Escape') closeAcDrop(boxId);
  });
  document.addEventListener('click',function(e){
    var wrap=document.getElementById('acWrap_'+boxId);
    if(wrap&&!wrap.contains(e.target)) closeAcDrop(boxId);
  });
}

function acOnInput(inp,boxId,resId){
  var val=inp.value.trim();
  clearTimeout(acTimers[boxId]);
  if(val.length<2){ closeAcDrop(boxId); return; }
  acTimers[boxId]=setTimeout(function(){ acFetch(val,boxId,inp.id,resId); },320);
}

async function acFetch(q,boxId,inpId,resId){
  if(!S.proxyUrl) return;
  var spin=document.getElementById('acSpin_'+boxId);
  if(spin) spin.style.display='';
  try{
    var r=await fetch(S.proxyUrl+'/api/quote?search='+encodeURIComponent(q));
    var data=await r.json();
    var results=data.results||[];
    renderAcDrop(results,boxId,inpId,resId);
  }catch(e){ closeAcDrop(boxId); }
  if(spin) spin.style.display='none';
}

function renderAcDrop(results,boxId,inpId,resId){
  closeAcDrop(boxId);
  if(!results.length){
    var none=document.createElement('div');
    none.className='ac-drop'; none.id='acDrop_'+boxId;
    none.innerHTML='<div class="ac-none">No results found</div>';
    document.getElementById('acWrap_'+boxId).appendChild(none);
    return;
  }
  var html=results.map(function(r,i){
    return '<div class="ac-item" data-sym="'+esc(r.symbol)+'" data-name="'+esc(r.name)+'">'
      +'<div><div class="ac-sym">'+esc(r.symbol)+'</div><div class="ac-name">'+esc(r.name)+'</div></div>'
      +'<div class="ac-exch">'+esc(r.exchange||r.type||'')+'</div>'
      +'</div>';
  }).join('');
  var drop=document.createElement('div');
  drop.className='ac-drop'; drop.id='acDrop_'+boxId;
  drop.innerHTML=html;
  drop.querySelectorAll('.ac-item').forEach(function(item){
    item.addEventListener('click',function(){
      var sym=this.dataset.sym;
      var inp=document.getElementById(inpId);
      inp.value=sym;
      closeAcDrop(boxId);
      execSearch(inpId,'sBtn_'+boxId,resId);
    });
  });
  document.getElementById('acWrap_'+boxId).appendChild(drop);
}

function closeAcDrop(boxId){
  var d=document.getElementById('acDrop_'+boxId);
  if(d) d.remove();
}

async function execSearch(inpId,btnId,resId){
  var raw=document.getElementById(inpId).value.trim().toUpperCase();
  if(!raw)return;
  var btn=document.getElementById(btnId),res=document.getElementById(resId);
  btn.disabled=true; btn.textContent='Searching…';
  res.innerHTML='<div class="msg"><span class="spin"></span></div>';
  if(!S.proxyUrl){res.innerHTML='<div class="msg err">Add your Proxy URL in ⚙ Settings first.</div>';btn.disabled=false;btn.textContent='Search';return;}
  try{
    var rawQuote=await fetchQuote(raw);
    var quote=MarketBrief.marketData.normalizeQuote(rawQuote,raw);
    if(quote.status==='invalid')throw new Error('No data for "'+raw+'"');
    lastSearchSym=raw;
    var cls=Math.abs(quote.percentChange)<0.01?'neu':(quote.percentChange>=0?'up':'dn');
    var arr=cls==='neu'?'—':(quote.percentChange>=0?'▲':'▼');
    var cardId='tc_'+resId;
    var sessionPresentation=getSearchSessionPresentation(raw);
    var statusBadge=sessionPresentation.active
      ?'<span id="tradeBadge_'+resId+'" style="display:inline-flex;align-items:center;gap:4px;font-size:0.85rem;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);color:var(--grn);border-radius:20px;padding:2px 9px;margin-left:8px"><span class="dot" style="margin-right:0"></span>'+sessionPresentation.label+'</span>'
      :'<span id="tradeBadge_'+resId+'" style="display:inline-flex;align-items:center;font-size:0.85rem;background:rgba(100,116,139,0.15);border:1px solid var(--bor);color:var(--mut);border-radius:20px;padding:2px 9px;margin-left:8px">'+sessionPresentation.label+'</span>';
    res.innerHTML='<div class="tcard" id="'+cardId+'">'
      +'<div class="ttop"><div><div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px"><div class="tsym">'+esc(raw)+'</div>'+statusBadge+'</div><div class="tname">'+esc(quote.name||raw)+'</div></div>'
      +'<div style="text-align:right"><div class="tprice '+cls+'" id="tprice_'+resId+'">'+fmt(quote.displayPrice)+'</div>'
      +'<div class="cchg '+cls+'" id="tcchg_'+resId+'" style="text-align:right;margin-top:3px">'+arr+' '+fmtD(quote.change)+' ('+fmtP(quote.percentChange)+')</div></div></div>'
      +'<div class="sgrid">'
      // High, low and volume remain outside the canonical contract for now.
      +'<div class="sstat"><div class="ssl">Volume</div><div class="ssv" id="tssv0_'+resId+'">'+fmtVol(rawQuote.volume)+'</div></div>'
      +'<div class="sstat"><div class="ssl">Prev Close</div><div class="ssv" id="tssv1_'+resId+'">'+fmt(quote.previousClose)+'</div></div>'
      +'<div class="sstat"><div class="ssl">Day High</div><div class="ssv" id="tssv2_'+resId+'">'+fmt(rawQuote.high)+'</div></div>'
      +'<div class="sstat"><div class="ssl">Day Low</div><div class="ssv" id="tssv3_'+resId+'">'+fmt(rawQuote.low)+'</div></div>'
      +'</div>'
      +'</div>'
      +'<div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;">'
        +'<button class="analyze-btn" id="anBtn_'+resId+'" data-sym="'+esc(raw)+'" data-res="'+resId+'">✦ Analyse with AI</button>'
        +'<button class="analyze-btn about-btn" style="background:rgba(100,116,139,0.12);border-color:rgba(100,116,139,0.3);color:var(--mut);" id="abBtn_'+resId+'" data-sym="'+esc(raw)+'" data-res="'+resId+'" data-name="'+esc(quote.name)+'">ℹ About</button>'
        +'</div>'
      +'</div>'
      +'<div id="tai_'+resId+'"></div>';
  }catch(e){res.innerHTML='<div class="msg err">'+esc(e.message)+'</div>';}
  // Save search state for persistence across tab switches
  savedSearchQuery=raw;
  savedSearchHTML=res.innerHTML;
  btn.disabled=false; btn.textContent='Search';
}

function goToSearch(sym){
  showView('Search');
  // Allow Search view to render, then populate and execute
  setTimeout(function(){
    var inpId=isDesktop?'ac_searchBoxD':'ac_searchBox';
    var btnId=isDesktop?'sBtn_searchBoxD':'sBtn_searchBox';
    var resId=isDesktop?'tickResD':'tickRes';
    var inp=document.getElementById(inpId);
    if(inp){
      inp.value=sym;
      execSearch(inpId,btnId,resId);
    }
  },80);
}
