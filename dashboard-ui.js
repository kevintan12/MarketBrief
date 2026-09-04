// ── Dashboard UI / filters ─────────────────────────────────────────────────────────
function setFilter(f,btn){
  curFilter=f;
  document.querySelectorAll('#mktChips .chip').forEach(function(b){b.classList.remove('on');});
  btn.classList.add('on');
  clearTimeout(window._riTimer);
  window._riTimer=setTimeout(renderIndices,80);
}
function setFilterD(f,btn){
  curFilter=f;
  document.querySelectorAll('#mktChipsD .chip').forEach(function(b){b.classList.remove('on');});
  btn.classList.add('on');
  clearTimeout(window._riTimer);
  window._riTimer=setTimeout(renderIndices,80);
}

function setGridHTML(h){var a=document.getElementById('idxGrid'),b=document.getElementById('idxGridD');if(a)a.innerHTML=h;if(b)b.innerHTML=h;}

function renderIndices(){
  var all=mktData;
  var filtered=curFilter==='all'?all:all.filter(function(d){return d.mkt===curFilter;});
  if(!filtered.length){setGridHTML('<div class="msg">No data for this filter.</div>');return;}
  // Sort order: US index, US user list, SG index, SG user list, HK index, HK user list
  var MKT_ORDER={US:0,SG:1,HK:2};
  var FIXED_SYMS={'^DJI':1,'^IXIC':1,'^GSPC':1,'^STI':1,'^HSI':1};
  function sortKey(d){
    var mo=MKT_ORDER[d.mkt]!=null?MKT_ORDER[d.mkt]:3;
    var isIdx=FIXED_SYMS[d.sym]?0:1;
    return mo*10+isIdx;
  }
  var sorted=filtered.slice().sort(function(a,b){return sortKey(a)-sortKey(b);});
  ['idxGrid','idxGridD'].forEach(function(gid){
    var g=document.getElementById(gid); if(!g)return;
    var existing=Array.from(g.querySelectorAll('[data-sym]'));
    var sameTickers=existing.length===sorted.length&&existing.every(function(card,i){
      return card.dataset.sym===sorted[i].sym;
    });
    if(!sameTickers){
      // Full render with market group headers
      var html='';
      var lastGroup='';
      var groupLabels={US:'🇺🇸 US Markets',SG:'🇸🇬 Singapore Markets',HK:'🇭🇰 Hong Kong Markets'};
      var userListLabel=activeTickerList==='myStocks'?'My Stocks':'Watchlist';
      sorted.forEach(function(d){
        var isIdx=FIXED_SYMS[d.sym]?'idx':'watch';
        var grpKey=d.mkt+'-'+isIdx;
        if(grpKey!==lastGroup){
          lastGroup=grpKey;
          var grpLabel=(isIdx==='idx'?groupLabels[d.mkt]+' · Indices':groupLabels[d.mkt]+' · '+userListLabel);
          html+='<div style="font-size:0.78rem;letter-spacing:0.1em;color:var(--orange);text-transform:uppercase;padding:10px 4px 4px;border-top:'+(html?'1px solid rgba(249,115,22,0.2)':'none')+';">'+grpLabel+'</div>';
        }
        var cls=Math.abs(d.pct)<0.01?'neu':(d.pct>=0?'up':'dn');
        var arr=cls==='neu'?'—':(d.pct>=0?'▲':'▼');
        html+='<div class="card" data-sym="'+esc(d.sym)+'">'+
          '<div class="cleft"><div class="flag">'+d.flag+'</div>'+
          '<div style="min-width:0"><div class="cname">'+esc(d.name)+'</div>'+
          '<div class="csub">'+esc(d.sub)+'<span class="csym">'+esc(d.sym)+'</span></div></div></div>'+
          '<div class="cright"><div class="cprice '+cls+'" id="cp_'+gid+'_'+esc(d.sym)+'">'+fmt(d.price)+'</div>'+
          '<div class="cchg '+cls+'" id="cc_'+gid+'_'+esc(d.sym)+'">'+arr+' '+fmtD(d.chg)+' ('+fmtP(d.pct)+')</div></div>'+
          '</div>';
      });
      g.innerHTML=html;
      return;
    }
    // In-place update
    sorted.forEach(function(d){
      var cls=Math.abs(d.pct)<0.01?'neu':(d.pct>=0?'up':'dn');
      var arr=cls==='neu'?'—':(d.pct>=0?'▲':'▼');
      var pr=document.getElementById('cp_'+gid+'_'+d.sym);
      var ch=document.getElementById('cc_'+gid+'_'+d.sym);
      if(pr){pr.className='cprice '+cls;pr.textContent=fmt(d.price);}
      if(ch){ch.className='cchg '+cls;ch.textContent=arr+' '+fmtD(d.chg)+' ('+fmtP(d.pct)+')';}

    });
  });
}
