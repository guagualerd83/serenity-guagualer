let DATA=null, PERIOD="quarterly";
const fmtDate=v=>v?new Date(v).toLocaleString("zh-TW",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const esc=s=>(s??"").toString().replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
async function init(){
  DATA=await fetch("data/dashboard.json",{cache:"no-store"}).then(r=>r.json());
  document.querySelector("#updated").textContent="更新 "+fmtDate(DATA.site.generated_at);
  document.querySelectorAll("[data-period]").forEach(b=>b.onclick=()=>{PERIOD=b.dataset.period;document.querySelectorAll("[data-period]").forEach(x=>x.classList.toggle("active",x===b));render()});
  render(); renderPosts();
}
function render(){
  const d=DATA.periods[PERIOD];
  document.querySelector("#numbers").innerHTML=`
    <div class="number"><span class="muted">Primary posts</span><b>${d.primary_post_count??d.tweet_count??0}</b></div>
    <div class="number"><span class="muted">提及股票</span><b>${d.symbol_count??0}</b></div>
    <div class="number"><span class="muted">高重要度</span><b>${d.high_importance_count??0}</b></div>`;
  const rows=(d.symbols||[]).slice(0,24).map(x=>`
    <a class="symbol" href="stock/?symbol=${encodeURIComponent(x.symbol)}">
      <div class="ticker">$${esc(x.symbol)}</div>
      <div class="sentiment ${esc(x.dominant_sentiment)}">${esc(x.dominant_sentiment)}</div>
      <div>${x.mentions} mentions</div>
      <div class="thesis muted">${esc(x.latest_thesis||x.latest_summary_zh||"")}</div>
    </a>`).join("");
  document.querySelector("#symbols").innerHTML=rows||`<div class="note muted">這個期間目前沒有 Primary post ticker。</div>`;
}
function renderPosts(){
 const html=(DATA.latest_primary_posts||[]).slice(0,18).map(p=>`
  <article class="note">
   <div class="note-head"><span class="chips">${esc((p.symbols||[]).map(s=>"$"+s).join(" · "))}</span><span class="small">${fmtDate(p.created_at)}</span></div>
   ${p.core_thesis?`<p><strong>${esc(p.core_thesis)}</strong></p>`:""}
   <p>${esc(p.summary_zh||p.text||"")}</p>
   <a href="${esc(p.url)}" target="_blank" rel="noopener">原始貼文 ↗</a>
  </article>`).join("");
 document.querySelector("#posts").innerHTML=html||`<div class="note muted">尚無資料。</div>`;
}
init().catch(e=>document.body.innerHTML=`<pre>${esc(e.message)}</pre>`);
