(()=>{
"use strict";

/*
  Serenity AI Research v2
  - failure-isolated: never fetches, never touches original chart/metrics/posts renderers
  - reads only window.__SERENITY_STOCK__
  - Primary posts are authoritative; replies are supporting context only
  - no popularity-based ranking
  - no API key / no public Gemini call
*/

const box = document.querySelector("#aiResearch");
const answer = document.querySelector("#aiAnswer");
const sourceCount = document.querySelector("#aiSourceCount");
if (!box || !answer) return;

let stock = null;

const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[m]));

const clean = s => String(s ?? "").replace(/\s+/g," ").trim();

const fmt = v => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v).slice(0,10) : d.toLocaleDateString("zh-TW");
};

const dateKey = v => String(v ?? "").slice(0,10);

const sentimentClass = s => {
  const v = String(s || "Neutral").toLowerCase();
  if (v === "bullish") return "bullish";
  if (v === "bearish") return "bearish";
  if (v === "mixed") return "mixed";
  return "neutral";
};

const thesisLabel = v => ({
  NEW:"建立論點",
  MAJOR_UPDATE:"重大更新",
  REVERSAL:"方向反轉",
  UPDATE:"更新",
  REITERATION:"重申",
  NO_CHANGE:"無重大變化"
}[String(v || "").toUpperCase()] || clean(v) || "更新");

function normalizeList(v){
  if (!v) return [];
  if (Array.isArray(v)) return v.flatMap(normalizeList);
  if (typeof v === "object") return Object.values(v).flatMap(normalizeList);
  return String(v)
    .split(/\n|;|；|\u2022/)
    .map(clean)
    .filter(Boolean);
}

function uniqueStrings(items){
  const seen = new Set();
  const out = [];
  for (const raw of items){
    const s = clean(raw);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function confidenceValue(v){
  if (v == null || v === "") return null;
  if (typeof v === "number") return v <= 1 ? Math.round(v*100) : Math.round(v);
  const s = clean(v).toLowerCase();
  const n = Number(s.replace("%",""));
  if (Number.isFinite(n)) return n <= 1 ? Math.round(n*100) : Math.round(n);
  if (["high","高","strong"].includes(s)) return 85;
  if (["medium","med","中","moderate"].includes(s)) return 60;
  if (["low","低","weak"].includes(s)) return 35;
  return null;
}

function primarySummary(x){
  return clean(x?.core_thesis || x?.summary_zh || x?.plain_zh || "");
}

function supportingSummary(x){
  return clean(
    x?.summary_zh ||
    x?.plain_zh ||
    x?.core_thesis ||
    (x?.text ? String(x.text).slice(0,240) : "")
  );
}

function isEnriched(x){
  return Boolean(
    primarySummary(x) ||
    clean(x?.why_it_matters) ||
    normalizeList(x?.catalysts).length ||
    normalizeList(x?.risks).length ||
    confidenceValue(x?.confidence) != null ||
    clean(x?.ai_status)
  );
}

function sourceLink(x, label="原始貼文 ↗"){
  return x?.url
    ? `<a class="ai-source-link" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(label)}</a>`
    : "";
}

function pill(text, cls=""){
  if (!clean(text)) return "";
  return `<span class="ai-pill ${cls}">${esc(text)}</span>`;
}

function metric(label, value){
  return `<div class="ai-mini-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function primaryPosts(){
  return (Array.isArray(stock?.primary_posts) ? stock.primary_posts : [])
    .filter(x => primarySummary(x));
}

function replies(){
  return Array.isArray(stock?.reply_context) ? stock.reply_context : [];
}

function latestDirectional(posts){
  const sorted = [...posts].sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
  return sorted.find(x=>["Bullish","Bearish"].includes(x.sentiment)) || sorted[0];
}

function initAddon(d){
  try{
    stock = d || {};
    const pAll = Array.isArray(stock.primary_posts) ? stock.primary_posts : [];
    const rAll = replies();
    const enrichedCount = pAll.filter(isEnriched).length;

    sourceCount.textContent =
      `${pAll.length} Primary · ${rAll.length} Supporting · ${enrichedCount} enriched`;

    document.querySelectorAll("[data-ai-mode]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        document.querySelectorAll("[data-ai-mode]").forEach(x=>x.classList.toggle("active",x===btn));
        render(btn.dataset.aiMode);
      });
    });

    box.hidden = false;
    render("latest");
  }catch(err){
    console.error("AI addon failed:", err);
    box.hidden = true;
  }
}

function render(mode){
  try{
    const p = primaryPosts();
    if (!p.length){
      answer.innerHTML = `
        <div class="ai-empty">
          <strong>尚無可用的 AI enrichment。</strong>
          <div class="muted">Primary posts 已存在，但 core_thesis / summary_zh / plain_zh 尚未產生內容。</div>
        </div>`;
      return;
    }

    if (mode === "latest") answer.innerHTML = renderLatest(p);
    else if (mode === "timeline") answer.innerHTML = renderTimeline(p);
    else if (mode === "keyposts") answer.innerHTML = renderKeyPosts(p);
    else if (mode === "risks") answer.innerHTML = renderRisks(p);
  }catch(err){
    console.error("AI addon render failed:", err);
    answer.innerHTML = `<p class="muted">AI 研究區暫時無法顯示；原始股票資料不受影響。</p>`;
  }
}

function renderLatest(posts){
  const x = latestDirectional(posts);
  const summary = primarySummary(x);
  const why = clean(x.why_it_matters);
  const catalysts = uniqueStrings(normalizeList(x.catalysts)).slice(0,4);
  const risks = uniqueStrings(normalizeList(x.risks)).slice(0,4);
  const conf = confidenceValue(x.confidence);

  const supporting = replies()
    .filter(r => supportingSummary(r))
    .sort((a,b)=>
      (Number(b.importance)||0) - (Number(a.importance)||0) ||
      String(b.created_at||"").localeCompare(String(a.created_at||""))
    )
    .slice(0,2);

  return `
    <div class="ai-section-title">
      <div>
        <div class="eyebrow">CURRENT VIEW</div>
        <h3>最新有效觀點</h3>
      </div>
      <div class="ai-badges">
        ${pill(x.sentiment || "Neutral", sentimentClass(x.sentiment))}
        ${pill(thesisLabel(x.thesis_change), "change")}
        ${conf == null ? "" : pill(`信心 ${conf}%`, "confidence")}
      </div>
    </div>

    <div class="ai-snapshot-grid">
      ${metric("日期", fmt(x.created_at))}
      ${metric("重要度", `★${Number(x.importance)||1}`)}
      ${metric("AI 狀態", clean(x.ai_status) || "—")}
      ${metric("來源", "Primary")}
    </div>

    <div class="ai-thesis-card">
      <div class="eyebrow">CORE THESIS</div>
      <p class="ai-thesis">${esc(summary)}</p>
      ${why ? `<div class="ai-why"><strong>為什麼重要</strong><p>${esc(why)}</p></div>` : ""}
    </div>

    ${(catalysts.length || risks.length) ? `
      <div class="ai-two-col">
        <div class="ai-panel">
          <div class="eyebrow">CATALYSTS</div>
          ${catalysts.length
            ? `<ul>${catalysts.map(v=>`<li>${esc(v)}</li>`).join("")}</ul>`
            : `<p class="muted">這篇沒有明確催化劑。</p>`}
        </div>
        <div class="ai-panel">
          <div class="eyebrow">RISKS</div>
          ${risks.length
            ? `<ul>${risks.map(v=>`<li>${esc(v)}</li>`).join("")}</ul>`
            : `<p class="muted">這篇沒有明確風險陳述。</p>`}
        </div>
      </div>` : ""}

    <div class="ai-source-row">
      ${sourceLink(x)}
      <span class="muted">Primary post 為正式觀點依據；replies 僅作補充脈絡。</span>
    </div>

    ${supporting.length ? `
      <details class="ai-supporting">
        <summary>Supporting context · ${supporting.length} 則代表性回覆</summary>
        <div class="ai-supporting-body">
          ${supporting.map(r=>`
            <div class="ai-support-row">
              <div class="small">${fmt(r.created_at)} · ★${Number(r.importance)||1}</div>
              <p>${esc(supportingSummary(r))}</p>
              ${sourceLink(r, "回覆原文 ↗")}
            </div>`).join("")}
        </div>
      </details>` : ""}
  `;
}

function significantTimeline(posts){
  const sorted = [...posts].sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||"")));
  let candidates = sorted.filter(x=>{
    const c = String(x.thesis_change||"").toUpperCase();
    return ["NEW","MAJOR_UPDATE","REVERSAL"].includes(c) || Number(x.importance||0) >= 4;
  });

  const latest = sorted.at(-1);
  if (latest && !candidates.includes(latest)) candidates.push(latest);
  if (!candidates.length) candidates = sorted;

  const dedup = [];
  const seen = new Set();
  for (const x of candidates){
    const key = `${dateKey(x.created_at)}|${String(x.thesis_change||"")}|${primarySummary(x).slice(0,90).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(x);
  }

  if (dedup.length <= 7) return dedup;
  const idx = [0,.16,.33,.5,.67,.84,1].map(v=>Math.round((dedup.length-1)*v));
  return [...new Set(idx)].map(i=>dedup[i]);
}

function renderTimeline(posts){
  const selected = significantTimeline(posts);
  const first = selected[0];
  const last = selected[selected.length-1];

  return `
    <div class="ai-section-title">
      <div>
        <div class="eyebrow">THESIS EVOLUTION</div>
        <h3>投資論點如何演變</h3>
      </div>
      <div class="small">${first ? fmt(first.created_at) : "—"} → ${last ? fmt(last.created_at) : "—"}</div>
    </div>

    <div class="ai-timeline-v2">
      ${selected.map((x,i)=>{
        const conf = confidenceValue(x.confidence);
        return `
          <div class="ai-timeline-event">
            <div class="ai-timeline-marker"><span>${i+1}</span></div>
            <div class="ai-timeline-card">
              <div class="ai-event-head">
                <div>
                  <div class="small">${fmt(x.created_at)} · ★${Number(x.importance)||1}</div>
                  <div class="ai-badges">
                    ${pill(x.sentiment||"Neutral", sentimentClass(x.sentiment))}
                    ${pill(thesisLabel(x.thesis_change), "change")}
                    ${conf == null ? "" : pill(`${conf}% confidence`, "confidence")}
                  </div>
                </div>
                ${sourceLink(x)}
              </div>
              <p class="ai-event-thesis">${esc(primarySummary(x))}</p>
              ${clean(x.history_note) ? `<p class="ai-history-note">${esc(clean(x.history_note))}</p>` : ""}
              ${clean(x.why_it_matters) ? `<p class="muted"><strong>Impact：</strong>${esc(clean(x.why_it_matters))}</p>` : ""}
            </div>
          </div>`;
      }).join("")}
    </div>
  `;
}

function keyPostScore(x){
  let score = (Number(x.importance)||1) * 10;
  const change = String(x.thesis_change||"").toUpperCase();
  if (change === "NEW") score += 16;
  if (change === "MAJOR_UPDATE") score += 22;
  if (change === "REVERSAL") score += 28;
  const conf = confidenceValue(x.confidence);
  if (conf != null) score += conf / 20;
  if (clean(x.why_it_matters)) score += 4;
  if (normalizeList(x.catalysts).length) score += 3;
  if (normalizeList(x.risks).length) score += 2;
  return score;
}

function renderKeyPosts(posts){
  const scored = posts
    .map((x,i)=>({x,i,score:keyPostScore(x)}))
    .sort((a,b)=>b.score-a.score || a.i-b.i);

  const picked = [];
  const seenDates = new Set();
  const seenThesis = new Set();

  for (const item of scored){
    const x = item.x;
    const d = dateKey(x.created_at);
    const t = primarySummary(x).toLowerCase().replace(/\W+/g," ").slice(0,120);

    if (d && seenDates.has(d)) continue;
    if (t && [...seenThesis].some(v => v === t)) continue;

    picked.push(item);
    if (d) seenDates.add(d);
    if (t) seenThesis.add(t);
    if (picked.length === 3) break;
  }

  for (const item of scored){
    if (picked.length === 3) break;
    if (!picked.includes(item)) picked.push(item);
  }

  return `
    <div class="ai-section-title">
      <div>
        <div class="eyebrow">KEY PRIMARY POSTS</div>
        <h3>3 個最關鍵的論點節點</h3>
      </div>
      <div class="small">依 thesis change、importance、confidence 與資訊完整度；不看按讚/轉推。</div>
    </div>

    <div class="ai-key-grid">
      ${picked.map((item,i)=>{
        const x = item.x;
        const change = String(x.thesis_change||"").toUpperCase();
        let reason = "高重要度、且對整體 thesis 有代表性的 Primary post。";
        if (change === "NEW") reason = "建立或首次明確定義這支股票的核心 thesis。";
        else if (change === "MAJOR_UPDATE") reason = "加入足以改變 thesis 權重的重要新資訊或催化劑。";
        else if (change === "REVERSAL") reason = "代表方向性判斷出現反轉，是論點演變中最重要的節點之一。";

        return `
          <article class="ai-key-card">
            <div class="ai-key-number">0${i+1}</div>
            <div class="small">${fmt(x.created_at)} · ★${Number(x.importance)||1}</div>
            <div class="ai-badges">
              ${pill(x.sentiment||"Neutral", sentimentClass(x.sentiment))}
              ${pill(thesisLabel(x.thesis_change), "change")}
            </div>
            <p class="ai-key-thesis">${esc(primarySummary(x))}</p>
            <div class="ai-key-why"><strong>入選原因</strong><p>${esc(reason)}</p></div>
            ${sourceLink(x)}
          </article>`;
      }).join("")}
    </div>
  `;
}

function renderRisks(posts){
  const map = new Map();

  for (const x of posts){
    for (const risk of uniqueStrings(normalizeList(x.risks))){
      const key = risk.toLowerCase();
      const prev = map.get(key);
      if (!prev){
        map.set(key,{
          text:risk,
          count:1,
          latest:x.created_at,
          url:x.url,
          importance:Number(x.importance)||1
        });
      }else{
        prev.count += 1;
        if (String(x.created_at||"") > String(prev.latest||"")){
          prev.latest = x.created_at;
          prev.url = x.url;
          prev.importance = Number(x.importance)||prev.importance;
        }
      }
    }
  }

  const risks = [...map.values()]
    .sort((a,b)=>b.count-a.count || String(b.latest||"").localeCompare(String(a.latest||"")))
    .slice(0,10);

  if (!risks.length){
    return `
      <div class="ai-section-title">
        <div>
          <div class="eyebrow">RISK REGISTER</div>
          <h3>Serenity 明確提到的風險</h3>
        </div>
      </div>
      <div class="ai-empty">
        <strong>目前 enrichment 中沒有明確 risks。</strong>
        <div class="muted">這不等於該股票沒有風險；只是 Serenity 的 Primary posts 中沒有足夠明確的風險陳述。</div>
      </div>`;
  }

  return `
    <div class="ai-section-title">
      <div>
        <div class="eyebrow">RISK REGISTER</div>
        <h3>Serenity 明確提到的風險</h3>
      </div>
      <div class="small">${risks.length} 個去重後風險</div>
    </div>

    <div class="ai-risk-list">
      ${risks.map((r,i)=>`
        <div class="ai-risk-row">
          <div class="ai-risk-index">${String(i+1).padStart(2,"0")}</div>
          <div class="ai-risk-main">
            <p>${esc(r.text)}</p>
            <div class="small">最近提到：${fmt(r.latest)}${r.count>1 ? ` · 出現 ${r.count} 次` : ""}</div>
          </div>
          ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">證據 ↗</a>` : ""}
        </div>`).join("")}
    </div>

    <p class="muted ai-method-note">
      僅整理 Serenity 在 Primary posts 中明確輸出的 risks；不自行推導額外風險。
    </p>
  `;
}

if (window.__SERENITY_STOCK__){
  initAddon(window.__SERENITY_STOCK__);
}else{
  window.addEventListener("serenity-stock-ready", e=>initAddon(e.detail), {once:true});
}

})();