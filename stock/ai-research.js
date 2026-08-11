(()=>{
"use strict";

/*
  Failure-isolated addon:
  - no fetch()
  - no dashboard.json dependency
  - no Gemini/API key
  - never modifies the original chart / metrics / posts renderers
*/
const box=document.querySelector("#aiResearch");
const answer=document.querySelector("#aiAnswer");
const sourceCount=document.querySelector("#aiSourceCount");
if(!box||!answer) return;

const esc=s=>(s??"").toString().replace(/[&<>"']/g,m=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[m]));
const fmt=v=>v?new Date(v).toLocaleDateString("zh-TW"):"—";
const clean=s=>String(s??"").replace(/\s+/g," ").trim();
const summaryOf=x=>clean(x.core_thesis||x.summary_zh||x.plain_zh||"");
const linkOf=x=>x?.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener">原文 ↗</a>`:"";

let stock=null;

function initAddon(d){
  try{
    stock=d||{};
    const p=Array.isArray(stock.primary_posts)?stock.primary_posts:[];
    const r=Array.isArray(stock.reply_context)?stock.reply_context:[];
    sourceCount.textContent=`${p.length} Primary · ${r.length} Supporting`;

    document.querySelectorAll("[data-ai-mode]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        document.querySelectorAll("[data-ai-mode]").forEach(x=>x.classList.toggle("active",x===btn));
        render(btn.dataset.aiMode);
      });
    });

    box.hidden=false;
    render("latest");
  }catch(err){
    console.error("AI addon failed:",err);
    // Original stock page stays untouched.
    box.hidden=true;
  }
}

function primary(){
  return (stock?.primary_posts||[]).filter(x=>summaryOf(x));
}

function render(mode){
  try{
    const p=primary();
    if(!p.length){
      answer.innerHTML='<p class="muted">目前沒有可用的 Primary 摘要。</p>';
      return;
    }
    if(mode==="latest") answer.innerHTML=latest(p);
    else if(mode==="timeline") answer.innerHTML=timeline(p);
    else if(mode==="keyposts") answer.innerHTML=keyposts(p);
    else if(mode==="risks") answer.innerHTML=risks(p);
  }catch(err){
    console.error("AI addon render failed:",err);
    answer.innerHTML='<p class="muted">研究摘要暫時無法顯示；原始股票資料不受影響。</p>';
  }
}

function latest(posts){
  const sorted=[...posts].sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
  const x=sorted.find(v=>["Bullish","Bearish"].includes(v.sentiment))||sorted[0];
  return `
    <h3>最新觀點 · ${esc(x.sentiment||"Neutral")}</h3>
    <div class="small">${fmt(x.created_at)} · ★${x.importance||1}</div>
    <p><strong>${esc(summaryOf(x))}</strong></p>
    ${clean(x.why_it_matters)?`<p>${esc(clean(x.why_it_matters))}</p>`:""}
    ${linkOf(x)}
  `;
}

function timeline(posts){
  const sorted=[...posts].sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||"")));
  const meaningful=[];
  let last="";
  for(const x of sorted){
    const s=summaryOf(x);
    const key=[x.sentiment||"",x.thesis_change||"",s.slice(0,100)].join("|");
    if(key===last) continue;
    last=key;
    meaningful.push(x);
  }
  let selected=meaningful;
  if(selected.length>6){
    const idx=[0,.2,.4,.6,.8,1].map(v=>Math.round((selected.length-1)*v));
    selected=[...new Set(idx)].map(i=>meaningful[i]);
  }
  return `<h3>投資論點脈絡</h3><div class="ai-timeline">${
    selected.map(x=>`
      <div class="ai-timeline-item">
        <div class="small">${fmt(x.created_at)}<br>${esc(x.sentiment||"Neutral")}</div>
        <div>
          <strong>${esc(x.thesis_change||"UPDATE")}</strong>
          <p>${esc(summaryOf(x))}</p>
          ${linkOf(x)}
        </div>
      </div>`).join("")
  }</div>`;
}

function keyposts(posts){
  // Deliberately excludes likes / retweets / popularity.
  const scored=posts.map((x,i)=>{
    let score=(Number(x.importance)||1)*10;
    if(x.thesis_change==="NEW") score+=14;
    if(x.thesis_change==="MAJOR_UPDATE") score+=18;
    if(x.thesis_change==="REVERSAL") score+=22;
    if(clean(x.why_it_matters)) score+=3;
    return {x,score,i};
  }).sort((a,b)=>b.score-a.score||a.i-b.i);

  const picked=[];
  const dates=new Set();
  for(const item of scored){
    const date=String(item.x.created_at||"").slice(0,10);
    if(date&&dates.has(date)) continue;
    picked.push(item.x);
    if(date) dates.add(date);
    if(picked.length===3) break;
  }
  for(const item of scored){
    if(picked.length===3) break;
    if(!picked.includes(item.x)) picked.push(item.x);
  }

  return `<h3>3 個關鍵觀點</h3>${
    picked.map((x,i)=>{
      let why="高重要度的 Primary thesis 更新。";
      if(x.thesis_change==="NEW") why="建立或明確定義核心投資論點。";
      else if(x.thesis_change==="MAJOR_UPDATE") why="對既有 thesis 加入重大新資訊。";
      else if(x.thesis_change==="REVERSAL") why="代表原先投資方向出現重大改變。";
      return `<div class="ai-key-post">
        <div class="small">#${i+1} · ${fmt(x.created_at)} · ${esc(x.sentiment||"Neutral")}</div>
        <p><strong>${esc(summaryOf(x))}</strong></p>
        <p class="muted">為什麼重要：${esc(why)}</p>
        ${linkOf(x)}
      </div>`;
    }).join("")
  }`;
}

function normalizeRisks(v){
  if(!v) return [];
  if(Array.isArray(v)) return v.flatMap(normalizeRisks);
  if(typeof v==="string") return v.split(/\n|;|；/).map(clean).filter(Boolean);
  if(typeof v==="object") return Object.values(v).flatMap(normalizeRisks);
  return [];
}

function risks(posts){
  const found=[];
  const seen=new Set();
  for(const x of posts){
    for(const txt of normalizeRisks(x.risks)){
      const k=txt.toLowerCase();
      if(!seen.has(k)){
        seen.add(k);
        found.push({text:txt,date:x.created_at,url:x.url});
      }
    }
  }
  if(!found.length){
    return `<h3>被提到的風險</h3>
      <p>目前匯出的 Primary posts 中，沒有找到 Serenity 明確列出的風險欄位。</p>
      <p class="muted">這不代表該股票沒有風險，只代表本站資料中沒有足夠明確的 Serenity 風險陳述。</p>`;
  }
  return `<h3>被提到的風險</h3><ul>${
    found.slice(0,8).map(r=>`<li>${esc(r.text)} <span class="small">(${fmt(r.date)})</span>${r.url?` · <a href="${esc(r.url)}" target="_blank" rel="noopener">原文</a>`:""}</li>`).join("")
  }</ul>`;
}

// Works whether addon script loads before or after the stock JSON.
if(window.__SERENITY_STOCK__) initAddon(window.__SERENITY_STOCK__);
else window.addEventListener("serenity-stock-ready",e=>initAddon(e.detail),{once:true});
})();