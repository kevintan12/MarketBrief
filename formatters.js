// ── Summary formatter ─────────────────────────────────────────────────────────
function cleanAIText(txt){
  var lines=txt.split('\n');
  var cleaned=[];
  for(var i=0;i<lines.length;i++){
    var l=lines[i]; var t=l.trim().toLowerCase();
    if(!t){cleaned.push(l);continue;}
    // Drop any line that is pure AI meta-commentary
    if(/^(based on|according to my|from my|using my|after (searching|reviewing|checking|looking)|i (have|can now|will now|am going to|need to|should|would|found|searched|looked)|let me |here('s| is) (my|the|a|an) (analysis|summary|overview|breakdown|look)|i'd like to|i'll |i've |great[,!]|certainly[,!]|sure[,!]|of course|perfect[,!.]|i now have|i've (found|located|gathered|completed)|now (let me|i'll|i can)|with (that|these|this) (done|complete|in hand|information))/i.test(t)) continue;
    cleaned.push(l);
  }
  return cleaned.join('\n').replace(/^[\s\n]+/,'');
}
function applyInlineMarkdown(escaped){
  return escaped
    .replace(/\*\*([^*]+)\*\*/g,'<strong style="font-family:DM Mono,monospace;font-weight:500;color:var(--acc);">$1</strong>')
    .replace(/\*([^*]+)\*/g,'<em>$1</em>')
    .replace(/_([^_]+)_/g,'<em style="color:var(--mut);font-size:0.95rem;">$1</em>');
}
function safeLineHtml(line){
  // Split line into text/url segments, esc() text only, wrap URLs in <a>
  var result='';
  var urlRe=/(https?:\/\/[^\s]+)/g;
  var last=0; var m;
  while((m=urlRe.exec(line))!==null){
    result+=applyInlineMarkdown(esc(line.slice(last,m.index)));
    var url=m[1].replace(/[.,;:!?)]+$/,'');
    var display=url.replace(/^https?:\/\//,'');
    if(display.length>55) display=display.substring(0,55)+'…';
    result+='<a href="'+url+'" target="_blank" rel="noopener" style="color:var(--acc);text-decoration:underline;word-break:break-all;">'+display+'</a>';
    last=m.index+m[1].length;
  }
  result+=applyInlineMarkdown(esc(line.slice(last)));
  return result;
}
function formatSummary(txt){
  var html='';
  // Pre-process: convert markdown table blocks to HTML
  var lines=txt.split('\n');
  var i=0;
  while(i<lines.length){
    var line=lines[i].trim();
    // Detect start of markdown table (line with | that has a separator row next)
    if(/^\|/.test(line)&&i+1<lines.length&&/^\|[-| :]+\|/.test(lines[i+1].trim())){
      var tableLines=[];
      while(i<lines.length&&/^\|/.test(lines[i].trim())){
        tableLines.push(lines[i].trim());
        i++;
      }
      // Build HTML table
      var thtml='<div style="overflow-x:auto;margin:12px 0"><table style="width:100%;border-collapse:collapse;font-size:0.95rem;">';
      tableLines.forEach(function(tl,ti){
        if(/^\|[-| :]+\|/.test(tl))return; // skip separator
        var cells=tl.replace(/^\||\|$/g,'').split('|');
        var tag=ti===0?'th':'td';
        var rowStyle=ti===0?'background:rgba(0,212,255,0.08);':'';
        thtml+='<tr style="'+rowStyle+'">';
        cells.forEach(function(c){
          var cellTxt=c.trim();
          var bold=/\*\*/.test(cellTxt);
          var cellStyle='border:1px solid var(--bor);padding:7px 10px;color:'+(bold?'var(--acc)':'var(--txt)')+(bold?';font-weight:700':'')+';';
          thtml+='<'+tag+' style="'+cellStyle+'">'+applyInlineMarkdown(esc(cellTxt.replace(/\*\*/g,'')))+'</'+tag+'>';
        });
        thtml+='</tr>';
      });
      thtml+='</table></div>';
      html+=thtml;
      continue;
    }
    line=line.trim();
    if(!line){html+='<div style="height:6px"></div>';i++;continue;}
    if(line==='---'){html+='<hr style="border:none;border-top:1px solid var(--bor);margin:8px 0">';i++;continue;}
    var stripped=line.replace(/^#+\s*/,'').replace(/^[1-9][.)\s]+/,'').trim();
    var isHeader=/^#/.test(line)||/^[1-9][.)]\s/.test(line.trim())||stripped.charCodeAt(0)>255;
    if(isHeader&&line.indexOf('**')===-1){
      html+='<div style="font-family:Syne,sans-serif;font-weight:700;font-size:1.15rem;color:var(--orange);margin-top:20px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(249,115,22,0.25);">'+esc(stripped)+'</div>';
    } else if(/^[-•*]/.test(line)){
      html+='<div style="display:flex;gap:8px;margin-bottom:7px;"><span style="color:var(--orange);flex-shrink:0;margin-top:3px">›</span><span style="font-size:1.05rem;line-height:1.8;color:var(--txt);">'+safeLineHtml(line.replace(/^[-•*]\s*/,''))+'</span></div>';
    } else if(/^MB Value:/i.test(line)){
      var _mbParts=line.split('|');
      var _mbFirst=_mbParts[0].trim();
      var _mbRest=_mbParts.slice(1).map(function(p){return p.trim();}).join(' | ');
      var _mbHtml='<strong style="text-decoration:underline;font-weight:700;">'+esc(_mbFirst)+'</strong>'
        +(_mbRest?' | '+safeLineHtml(_mbRest):'');
      html+='<div style="margin-top:8px;font-size:1.05rem;line-height:1.7;color:var(--acc);">'+_mbHtml+'</div>';
    } else if(/^Outlook:/i.test(line)||/^Sentiment:/i.test(line)||/^Verdict:/i.test(line)){
      html+='<div style="margin-top:14px;padding:10px 14px;background:rgba(0,212,255,0.07);border-left:3px solid var(--acc);border-radius:0 8px 8px 0;font-size:1.05rem;line-height:1.7;color:var(--acc);">'+safeLineHtml(line)+'</div>';
    } else if(/^[^:]{3,60}:\s*https?:\/\//.test(line)){
      var _ci=line.search(/:\s*https?:\/\//);
      var _label=line.slice(0,_ci).trim();
      var _url=line.slice(_ci+1).trim();
      var _urlClean=_url.replace(/[.,;:!?)]+$/,'');
      html+='<div style="margin-bottom:8px;"><a href="'+_urlClean+'" target="_blank" rel="noopener" style="color:var(--acc);text-decoration:underline;font-size:1.05rem;line-height:1.8;">'+esc(_label)+'</a></div>';
    } else {
      html+='<div style="font-size:1.05rem;line-height:1.8;color:var(--txt);margin-bottom:4px;">'+safeLineHtml(line)+'</div>';
    }
    i++;
  }
  return html;
}
function fmt(n){if(n===null||n===undefined)return '—';return Number(n).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3});}
function fmtVol(v){
  if(v===null||v===undefined||v===0||v==='0')return '—';
  var n=Number(v);
  if(isNaN(n)||n<=0)return '—';
  if(n>=1e9)return (n/1e9).toFixed(2)+'B';
  if(n>=1e6)return (n/1e6).toFixed(2)+'M';
  if(n>=1e3)return (n/1e3).toFixed(1)+'K';
  return n.toString();
}
function fmtP(p){if(p===null||p===undefined)return '—';return(p>=0?'+':'')+Number(p).toFixed(3)+'%';}
function fmtD(d){if(d===null||d===undefined)return '—';return(d>=0?'+':'')+Number(d).toFixed(3);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
