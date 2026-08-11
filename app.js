let DATA=null;
const VALID_PERIODS=["daily","weekly","monthly","quarterly"];
const params=new URLSearchParams(location.search);
let PERIOD=VALID_PERIODS.includes(params.get("period"))?params.get("period"):"quarterly";

const fmtDate=v=>v?new Date(v).toLocaleString("zh-TW",{
  year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"
}):"—";

const esc=s=>(s??"").toString().replace(/[&<>"']/g,m=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[m]));

function relativeTime(v){
  if(!v) return "—";
  const t=new Date(v).getTime();
  if(!Number.isFinite(t)) return "—";
  let sec=Math.floor((Date.now()-t)/1000);
  if(sec < 0) sec=0;
  if(sec < 60) return "剛剛";
  const min=Math.floor(sec/60);
  if(min < 60) return `${min} 分鐘前`;
  const hr=Math.floor(min/60);
  if(hr < 24) return `${hr} 小時前`;
  const day=Math.floor(hr/24);
  if(day < 30) return `${day} 天前`;
  return fmtDate(v);
}

function renderSyncedTime(){
  if(!DATA?.site?.generated_at) return;
  const el=document.querySelector("#updated");
  if(!el) return;
  el.textContent=`Last synced · ${relativeTime(DATA.site.generated_at)}`;
  el.title=`資料最後同步：${fmtDate(DATA.site.generated_at)}`;
}

async function init(){
  DATA=await fetch("data/dashboard.json",{cache:"no-store"}).then(r=>{
    if(!r.ok) throw new Error("dashboard.json 載入失敗");
    return r.json();
  });

  renderSyncedTime();
  setInterval(renderSyncedTime,60000);

  document.querySelectorAll("[data-period]").forEach(b=>{
    b.classList.toggle("active",b.dataset.period===PERIOD);
    b.onclick=()=>{
      PERIOD=b.dataset.period;
      document.querySelectorAll("[data-period]").forEach(x=>
        x.classList.toggle("active",x.dataset.period===PERIOD)
      );

      // Keep the selected range in the URL so reload/back navigation preserves it.
      const url=new URL(location.href);
      url.searchParams.set("period",PERIOD);
      history.replaceState(null,"",url);

      render();
    };
  });

  render();
  renderPosts();
}

function render(){
  const d=DATA.periods[PERIOD];
  if(!d) return;

  document.querySelector("#numbers").innerHTML=`
    <div class="number">
      <span class="muted">Primary posts</span>
      <b>${d.primary_post_count??d.tweet_count??0}</b>
    </div>
    <div class="number">
      <span class="muted">提及股票</span>
      <b>${d.symbol_count??(d.symbols||[]).length??0}</b>
    </div>
    <div class="number">
      <span class="muted">高重要度</span>
      <b>${d.high_importance_count??0}</b>
    </div>`;

  const rows=(d.symbols||[]).slice(0,24).map(x=>`
    <a class="symbol"
       href="stock/?symbol=${encodeURIComponent(x.symbol)}&period=${encodeURIComponent(PERIOD)}">
      <div class="ticker">$${esc(x.symbol)}</div>
      <div class="sentiment ${esc(x.dominant_sentiment)}">${esc(x.dominant_sentiment)}</div>
      <div>${x.mentions} mentions</div>
      <div class="thesis muted">${esc(x.latest_thesis||x.latest_summary_zh||"")}</div>
    </a>`).join("");

  document.querySelector("#symbols").innerHTML=
    rows||`<div class="note muted">這個期間目前沒有 Primary post ticker。</div>`;
}

function renderPosts(){
  const html=(DATA.latest_primary_posts||[]).slice(0,18).map(p=>`
    <article class="note">
      <div class="note-head">
        <span class="chips">${esc((p.symbols||[]).map(s=>"$"+s).join(" · "))}</span>
        <span class="small">${fmtDate(p.created_at)}</span>
      </div>
      ${p.core_thesis?`<p><strong>${esc(p.core_thesis)}</strong></p>`:""}
      <p>${esc(p.summary_zh||p.text||"")}</p>
      <a href="${esc(p.url)}" target="_blank" rel="noopener">原始貼文 ↗</a>
    </article>`).join("");

  document.querySelector("#posts").innerHTML=
    html||`<div class="note muted">尚無資料。</div>`;
}

init().catch(e=>{
  document.body.innerHTML=`<pre>${esc(e.message)}</pre>`;
});
