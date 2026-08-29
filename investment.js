// ── Invest ────────────────────────────────────────────────────────────────────
var investmentInputState={
  market:'US',
  strategy:'growth',
  amountMode:'slider',
  sliderAmount:10000,
  otherAmount:'',
  reportInputs:null
};

function formatInvestmentAmount(amount){
  return 'SGD '+Number(amount).toLocaleString('en-SG');
}

function getInvestmentBudget(){
  if(investmentInputState.amountMode==='other'){
    var amount=Number(investmentInputState.otherAmount);
    if(!Number.isFinite(amount)||!Number.isSafeInteger(amount)||amount<1000){
      return {error:'Enter a valid whole SGD amount of at least 1,000.'};
    }
    return {value:amount};
  }
  return {value:Number(investmentInputState.sliderAmount)};
}

function renderInvestmentReportHeader(pid){
  var el=document.getElementById('invReportMeta_'+pid); if(!el)return;
  var report=investmentInputState.reportInputs;
  if(!report){el.innerHTML='';return;}
  var marketLabel={US:'US',SG:'SG',HK:'HK'}[report.market]||report.market;
  var strategyLabel=report.strategy.charAt(0).toUpperCase()+report.strategy.slice(1);
  var generated=new Date(report.generatedAt).toLocaleString('en-SG',{
    timeZone:'Asia/Singapore',day:'numeric',month:'short',year:'numeric',
    hour:'numeric',minute:'2-digit',hour12:true
  });
  el.innerHTML='<div class="sumbox" style="margin-top:12px;margin-bottom:10px">'
    +'<div style="font-family:Syne,sans-serif;font-weight:700;font-size:1.05rem;color:var(--acc)">Investment Recommendation</div>'
    +'<div style="margin-top:7px;font-size:0.9rem;color:var(--mut)">Generated for:</div>'
    +'<div style="margin-top:2px;font-family:DM Mono,monospace;font-size:0.95rem;color:var(--txt)">'+marketLabel+' · '+strategyLabel+' · '+formatInvestmentAmount(report.budgetSGD)+'</div>'
    +'<div style="margin-top:7px;font-size:0.9rem;color:var(--mut)">Generated: '+generated+'</div>'
    +'</div>';
}

function syncInvestmentControls(){
  ['investPanel','investPanelD'].forEach(function(pid){
    var panel=document.getElementById(pid); if(!panel)return;
    panel.querySelectorAll('input[name="invMkt_'+pid+'"]').forEach(function(input){input.checked=input.value===investmentInputState.market;});
    panel.querySelectorAll('input[name="invStrat_'+pid+'"]').forEach(function(input){input.checked=input.value===investmentInputState.strategy;});
    panel.querySelectorAll('input[name="invAmtMode_'+pid+'"]').forEach(function(input){input.checked=input.value===investmentInputState.amountMode;});
    var slider=document.getElementById('invBudget_'+pid);
    var other=document.getElementById('invOther_'+pid);
    var sliderControls=document.getElementById('invSliderControls_'+pid);
    var otherControls=document.getElementById('invOtherControls_'+pid);
    if(slider){slider.value=investmentInputState.sliderAmount;slider.disabled=investmentInputState.amountMode!=='slider';}
    if(other){other.value=investmentInputState.otherAmount;other.disabled=investmentInputState.amountMode!=='other';}
    if(sliderControls)sliderControls.style.display=investmentInputState.amountMode==='slider'?'flex':'none';
    if(otherControls)otherControls.style.display=investmentInputState.amountMode==='other'?'block':'none';
    var budget=getInvestmentBudget();
    var display=document.getElementById('invBudgetVal_'+pid);
    var otherDisplay=document.getElementById('invOtherVal_'+pid);
    if(display)display.textContent=budget.error?'SGD —':formatInvestmentAmount(budget.value);
    if(otherDisplay)otherDisplay.textContent=budget.error?'SGD —':formatInvestmentAmount(budget.value);
    renderInvestmentReportHeader(pid);
  });
}

function attachInvestmentInputHandlers(pid){
  document.querySelectorAll('input[name="invMkt_'+pid+'"]').forEach(function(input){
    input.addEventListener('change',function(){investmentInputState.market=this.value;syncInvestmentControls();});
  });
  document.querySelectorAll('input[name="invStrat_'+pid+'"]').forEach(function(input){
    input.addEventListener('change',function(){investmentInputState.strategy=this.value;syncInvestmentControls();});
  });
  document.querySelectorAll('input[name="invAmtMode_'+pid+'"]').forEach(function(input){
    input.addEventListener('change',function(){investmentInputState.amountMode=this.value;syncInvestmentControls();});
  });
  var slider=document.getElementById('invBudget_'+pid);
  if(slider)slider.addEventListener('input',function(){investmentInputState.sliderAmount=Number(this.value);syncInvestmentControls();});
  var other=document.getElementById('invOther_'+pid);
  if(other)other.addEventListener('input',function(){investmentInputState.otherAmount=this.value;syncInvestmentControls();});
}

function renderInvestView(pid){
  var el=document.getElementById(pid); if(!el)return;
  el.innerHTML=
    '<div class="spanel">'
    +'<div class="srow">'
      +'<div class="slbl">Market</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;">'
        +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:1rem;color:var(--txt)"><input type="radio" name="invMkt_'+pid+'" value="US" style="accent-color:var(--acc)"> 🇺🇸 US</label>'
        +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:1rem;color:var(--txt)"><input type="radio" name="invMkt_'+pid+'" value="SG" style="accent-color:var(--acc)"> 🇸🇬 SGX</label>'
        +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:1rem;color:var(--txt)"><input type="radio" name="invMkt_'+pid+'" value="HK" style="accent-color:var(--acc)"> 🇭🇰 HKEX</label>'
      +'</div>'
    +'</div>'
    +'<div class="srow">'
      +'<div class="slbl">Investment Budget (SGD)</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;">'
        +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:1rem;color:var(--txt)"><input type="radio" name="invAmtMode_'+pid+'" value="slider" style="accent-color:var(--acc)"> Slider</label>'
        +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:1rem;color:var(--txt)"><input type="radio" name="invAmtMode_'+pid+'" value="other" style="accent-color:var(--acc)"> Other Amount</label>'
      +'</div>'
      +'<div id="invSliderControls_'+pid+'" style="display:flex;align-items:center;gap:12px;margin-top:6px;">'
        +'<input type="range" id="invBudget_'+pid+'" min="1000" max="100000" step="1000" style="flex:1;accent-color:var(--acc);">'
        +'<span id="invBudgetVal_'+pid+'" style="font-family:Syne,sans-serif;font-weight:700;font-size:1rem;color:var(--acc);white-space:nowrap;min-width:100px;text-align:right;">SGD 10,000</span>'
      +'</div>'
      +'<div id="invOtherControls_'+pid+'" style="display:none;margin-top:8px;">'
        +'<input class="sinp" type="number" inputmode="numeric" id="invOther_'+pid+'" min="1000" step="1000" placeholder="Enter amount in SGD">'
        +'<div id="invOtherVal_'+pid+'" style="font-family:Syne,sans-serif;font-weight:700;font-size:1rem;color:var(--acc);margin-top:6px;"></div>'
      +'</div>'
      +'<div id="invAmountMsg_'+pid+'"></div>'
    +'</div>'
    +'<div class="srow">'
      +'<div class="slbl">Strategy</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;">'
        +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:1rem;color:var(--txt)"><input type="radio" name="invStrat_'+pid+'" value="growth" style="accent-color:var(--acc)"> 📈 Growth</label>'
        +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:1rem;color:var(--txt)"><input type="radio" name="invStrat_'+pid+'" value="dividend" style="accent-color:var(--acc)"> 💰 Dividend</label>'
      +'</div>'
    +'</div>'
    +'<button class="savebtn" id="invBtn_'+pid+'" onclick="triggerInvestAI(\''+pid+'\')">✦ Generate Investment Ideas</button>'
    +'<div id="invReportMeta_'+pid+'"></div>'
    +'<div id="invResult_'+pid+'"></div>'
    +'</div>';
  attachInvestmentInputHandlers(pid);
  syncInvestmentControls();
  if(savedInvestHTML){setTimeout(function(){var r=document.getElementById('invResult_'+pid);if(r)r.innerHTML=savedInvestHTML;renderInvestmentReportHeader(pid);},50);}
}

function triggerInvestAI(pid){
  if(!S.proxyUrl){document.getElementById('invResult_'+pid).innerHTML='<div class="msg err">Add your Proxy URL in ⚙ Settings first.</div>';return;}
  var budget=getInvestmentBudget();
  var msg=document.getElementById('invAmountMsg_'+pid);
  if(budget.error){if(msg)msg.innerHTML='<div class="msg err">'+budget.error+'</div>';return;}
  if(msg)msg.innerHTML='';
  investmentInputState.reportInputs={
    market:investmentInputState.market,
    strategy:investmentInputState.strategy,
    budgetSGD:budget.value,
    generatedAt:new Date().toISOString()
  };
  renderInvestmentReportHeader(pid);
  var btn=document.getElementById('invBtn_'+pid);
  btn.disabled=true; btn.textContent='Generating…';
  genInvestAI(pid, investmentInputState.market, budget.value, investmentInputState.strategy);
}
