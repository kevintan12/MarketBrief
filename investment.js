// ── Invest ────────────────────────────────────────────────────────────────────
function renderInvestView(pid){
  var el=document.getElementById(pid); if(!el)return;
  el.innerHTML=
    '<div class="spanel">'
    +'<div class="srow">'
      +'<div class="slbl">Market</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;">'
        +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:1rem;color:var(--txt)"><input type="radio" name="invMkt_'+pid+'" value="US" checked style="accent-color:var(--acc)"> 🇺🇸 US</label>'
        +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:1rem;color:var(--txt)"><input type="radio" name="invMkt_'+pid+'" value="SG" style="accent-color:var(--acc)"> 🇸🇬 SGX</label>'
        +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:1rem;color:var(--txt)"><input type="radio" name="invMkt_'+pid+'" value="HK" style="accent-color:var(--acc)"> 🇭🇰 HKEX</label>'
      +'</div>'
    +'</div>'
    +'<div class="srow">'
      +'<div class="slbl">Investment Budget (SGD)</div>'
      +'<div style="display:flex;align-items:center;gap:12px;margin-top:6px;">'
        +'<input type="range" id="invBudget_'+pid+'" min="1000" max="100000" step="1000" value="10000" style="flex:1;accent-color:var(--acc);" oninput="document.getElementById(\'invBudgetVal_'+pid+'\').textContent=\'SGD \'+Number(this.value).toLocaleString()">'
        +'<span id="invBudgetVal_'+pid+'" style="font-family:Syne,sans-serif;font-weight:700;font-size:1rem;color:var(--acc);white-space:nowrap;min-width:100px;text-align:right;">SGD 10,000</span>'
      +'</div>'
    +'</div>'
    +'<div class="srow">'
      +'<div class="slbl">Strategy</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;">'
        +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:1rem;color:var(--txt)"><input type="radio" name="invStrat_'+pid+'" value="growth" checked style="accent-color:var(--acc)"> 📈 Growth</label>'
        +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:1rem;color:var(--txt)"><input type="radio" name="invStrat_'+pid+'" value="dividend" style="accent-color:var(--acc)"> 💰 Dividend</label>'
      +'</div>'
    +'</div>'
    +'<button class="savebtn" id="invBtn_'+pid+'" onclick="triggerInvestAI(\''+pid+'\')">✦ Generate Investment Ideas</button>'
    +'<div id="invResult_'+pid+'"></div>'
    +'</div>';
  if(savedInvestHTML){setTimeout(function(){var r=document.getElementById('invResult_'+pid);if(r)r.innerHTML=savedInvestHTML;},50);}
}

function triggerInvestAI(pid){
  if(!S.proxyUrl){document.getElementById('invResult_'+pid).innerHTML='<div class="msg err">Add your Proxy URL in ⚙ Settings first.</div>';return;}
  var mkt=document.querySelector('input[name="invMkt_'+pid+'"]:checked');
  var strat=document.querySelector('input[name="invStrat_'+pid+'"]:checked');
  var budget=document.getElementById('invBudget_'+pid);
  if(!mkt||!strat||!budget)return;
  var btn=document.getElementById('invBtn_'+pid);
  btn.disabled=true; btn.textContent='Generating…';
  genInvestAI(pid, mkt.value, parseInt(budget.value), strat.value);
}
