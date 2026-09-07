/* 画面と動き（スマホ版・Chrome拡張の共通部品） */
/* 画面のHTMLはここが唯一の場所。index.html と popup.html は器だけ */
const MARKUP = `
<header>
  <div style="max-width:640px;margin:0 auto">
    <span class="cnt" id="hcount">0 / 40</span>
    <h1>クリックポスト CSVメーカー<button id="btnPopout" hidden title="別ウィンドウで開く">⧉ 広く使う</button></h1>
  </div>
</header>

<div class="wrap">

  <h2>① セラーセントラルからコピーして貼る</h2>
  <div class="card">
    <textarea id="paste" placeholder="560-0036&#10;大阪府&#10;豊中市蛍池西町&#10;1-2-5&#10;山本勝久&#10;&#10;（続けて何件でも。空行で区切ってもOK・区切らなくてもOK）"></textarea>
    <div class="hint">郵便番号・都道府県・住所・氏名を自動で振り分けます。電話番号と「日本 / JP」は捨てます。</div>
    <div class="row" style="margin-top:10px">
      <button class="sec" id="btnClear" style="flex:0 0 96px">クリア</button>
      <button id="btnParse">振り分ける</button>
    </div>
  </div>

  <div id="msg" class="msg"></div>

  <div id="preview"></div>

  <h2>② 送るリスト <span id="lcount" style="font-weight:500"></span></h2>
  <div id="list"></div>

  <details>
    <summary>上級設定（ふつうは触らなくていい）</summary>
    <div class="card" style="margin-top:8px">
      <div class="f">
        <label>内容品の初期値</label>
        <input id="defItem" value="書籍">
      </div>
      <div class="f">
        <label>CSVのヘッダー行（公式テンプレートと違ったらここを直す）</label>
        <input id="header" class="mono" value="お届け先郵便番号,お届け先氏名,お届け先敬称,お届け先住所1行目,お届け先住所2行目,お届け先住所3行目,お届け先住所4行目,内容品">
      </div>
      <div class="f">
        <label>敬称</label>
        <select id="keisho"><option>様</option><option>御中</option></select>
      </div>
      <button class="ghost" id="btnWipe" style="margin-top:6px">リストを全部消す</button>
    </div>
  </details>

  <p class="hint" style="margin-top:18px">
    出力は Shift-JIS・1ファイル40件まで（41件以上は自動で分割）。<br>
    クリックポスト →「まとめ申込」→「ファイルを選択」で、保存したCSVを選ぶ。
  </p>
</div>

<div class="bar">
  <div class="wrap" style="max-width:640px;margin:0 auto">
    <button id="btnCsv" disabled>CSVを作る</button>
  </div>
</div>
`;
document.getElementById("root").innerHTML = MARKUP;

/* ===== 状態 ===== */
const S = {
  list: [],
  defItem: "書籍",
  header: "お届け先郵便番号,お届け先氏名,お届け先敬称,お届け先住所1行目,お届け先住所2行目,お届け先住所3行目,お届け先住所4行目,内容品",
  keisho: "様",
};
function save(){ try{ localStorage.setItem("cp_state", JSON.stringify(S)); }catch(e){} }
function load(){
  try{
    const j = JSON.parse(localStorage.getItem("cp_state")||"{}");
    if(j.list) S.list = j.list;
    if(j.defItem) S.defItem = j.defItem;
    if(j.header) S.header = j.header;
    if(j.keisho) S.keisho = j.keisho;
  }catch(e){}
}

/* ===== DOM ===== */
const $ = id => document.getElementById(id);
function msg(text, kind){
  const m = $("msg");
  if(!text){ m.className = "msg"; m.textContent=""; return; }
  m.className = "msg show " + (kind||"ok"); m.textContent = text;
}

/* --- 振り分け結果カード（編集できる） --- */
let draft = [];
function renderPreview(){
  const box = $("preview");
  box.innerHTML = "";
  if(!draft.length) return;

  const h = document.createElement("h2");
  h.textContent = "振り分け結果（直せます）";
  box.appendChild(h);

  draft.forEach((d,i)=>{
    const c = document.createElement("div");
    c.className = "card parsed";
    c.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span class="tag">${i+1}件目</span>
        <button class="x" data-del="${i}" style="width:auto;background:none;border:none;color:var(--sub);font-size:20px">×</button>
      </div>
      <div class="f"><label>郵便番号 <span class="lim" data-lim="zip"></span></label><input data-k="zip" inputmode="numeric" value="${esc(d.zip)}"></div>
      <div class="f"><label>氏名 <span class="lim" data-lim="name"></span></label><input data-k="name" value="${esc(d.name)}"></div>
      <div class="f"><label>住所1（都道府県） <span class="lim" data-lim="a0"></span></label><input data-k="a0" value="${esc(d.a[0])}"></div>
      <div class="f"><label>住所2（市区町村） <span class="lim" data-lim="a1"></span></label><input data-k="a1" value="${esc(d.a[1])}"></div>
      <div class="f"><label>住所3（番地） <span class="lim" data-lim="a2"></span></label><input data-k="a2" value="${esc(d.a[2])}"></div>
      <div class="f"><label>住所4（建物） <span class="lim" data-lim="a3"></span></label><input data-k="a3" value="${esc(d.a[3])}"></div>
      <div class="f"><label>内容品 <span class="lim" data-lim="item"></span></label><input data-k="item" value="${esc(d.item)}"></div>
      ${d.overflow ? `<div class="hint" style="color:var(--warn)">住所が4行に収まりきりませんでした（あふれ：${esc(d.overflow)}）。どこかに入れてください。</div>` : ""}
    `;
    c.querySelectorAll("input").forEach(inp=>{
      inp.addEventListener("input", ()=>{
        const k = inp.dataset.k;
        if(k === "zip") draft[i].zip = inp.value;
        else if(k === "name") draft[i].name = inp.value;
        else if(k === "item") draft[i].item = inp.value;
        else draft[i].a[Number(k.slice(1))] = inp.value;
        paintLimits(c, draft[i]);
        refreshAddBtn();
      });
    });
    c.querySelector("[data-del]").addEventListener("click", ()=>{ draft.splice(i,1); renderPreview(); });
    box.appendChild(c);
    paintLimits(c, d);
  });

  const btn = document.createElement("button");
  btn.id = "btnAdd";
  btn.textContent = `この ${draft.length} 件をリストに追加`;
  btn.style.marginBottom = "6px";
  btn.addEventListener("click", ()=>{
    const bad = draft.filter(d=>!valid(d));
    if(bad.length){ msg("赤くなっている欄があります。直してから追加してください。","err"); return; }
    S.list = S.list.concat(draft.map(d=>({...d, a:[...d.a]})));
    draft = []; $("paste").value = "";
    save(); renderPreview(); renderList();
    msg("リストに追加しました。","ok");
    window.scrollTo({top:document.body.scrollHeight, behavior:"smooth"});
  });
  box.appendChild(btn);
  refreshAddBtn();
}
function refreshAddBtn(){
  const b = $("btnAdd"); if(!b) return;
  b.textContent = `この ${draft.length} 件をリストに追加`;
}
function paintLimits(card, d){
  const map = {
    zip:[d.zip.replace(/[^\d]/g,"").length, 7, v=>v===7],
    name:[w(d.name), LIM_NAME, v=>v>0 && v<=LIM_NAME],
    a0:[w(d.a[0]), LIM_ADDR, v=>v<=LIM_ADDR],
    a1:[w(d.a[1]), LIM_ADDR, v=>v<=LIM_ADDR],
    a2:[w(d.a[2]), LIM_ADDR, v=>v<=LIM_ADDR],
    a3:[w(d.a[3]), LIM_ADDR, v=>v<=LIM_ADDR],
    item:[w(d.item), LIM_ITEM, v=>v>0 && v<=LIM_ITEM],
  };
  Object.entries(map).forEach(([k,[val,lim,ok]])=>{
    const s = card.querySelector(`[data-lim="${k}"]`);
    const inp = card.querySelector(`[data-k="${k}"]`);
    if(!s) return;
    s.textContent = k==="zip" ? `${val}/7桁` : `${val}/${lim}`;
    const good = ok(val);
    s.classList.toggle("over", !good);
    if(inp) inp.classList.toggle("over", !good);
  });
  const anyAddr = d.a.some(x=>x.trim());
  const s0 = card.querySelector('[data-lim="a0"]');
  if(s0 && !anyAddr) s0.classList.add("over");
}
function valid(d){
  if(d.zip.replace(/[^\d]/g,"").length !== 7) return false;
  if(!d.name.trim() || w(d.name) > LIM_NAME) return false;
  if(!d.a.some(x=>x.trim())) return false;
  if(d.a.some(x=>w(x) > LIM_ADDR)) return false;
  if(!d.item.trim() || w(d.item) > LIM_ITEM) return false;
  return true;
}
function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

/* --- 送るリスト --- */
function renderList(){
  const box = $("list"); box.innerHTML = "";
  $("hcount").textContent = `${S.list.length} / 40`;
  $("lcount").textContent = S.list.length > MAX_ROWS ? `（${Math.ceil(S.list.length/MAX_ROWS)}ファイルに分かれます）` : "";
  $("btnCsv").disabled = S.list.length === 0;
  $("btnCsv").textContent = S.list.length ? `CSVを作る（${S.list.length}件）` : "CSVを作る";
  if(!S.list.length){
    box.innerHTML = '<div class="empty">まだ空です。上に貼り付けて「振り分ける」。</div>';
    return;
  }
  S.list.forEach((d,i)=>{
    const el = document.createElement("div");
    el.className = "item";
    const addr = d.a.filter(Boolean).join(" ");
    el.innerHTML = `
      <div class="n">${i+1}</div>
      <div class="b">
        <div class="nm">${esc(d.name)} ${esc(S.keisho)}　<span class="tag">${esc(d.zip)}</span></div>
        <div class="ad">${esc(addr)}</div>
        <div class="ct">内容品：${esc(d.item)}</div>
      </div>
      <button class="x" title="削除">×</button>`;
    el.querySelector(".x").addEventListener("click", ()=>{ S.list.splice(i,1); save(); renderList(); });
    box.appendChild(el);
  });
}

/* ===== CSV出力（Shift-JIS） ===== */
function csvCell(v){
  v = String(v==null?"":v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v;
}
function buildCsv(rows){
  const lines = [S.header];
  rows.forEach(d=>{
    lines.push([
      d.zip.replace(/[^\d]/g,""),
      d.name.trim(),
      S.keisho,
      d.a[0]||"", d.a[1]||"", d.a[2]||"", d.a[3]||"",
      d.item.trim()
    ].map(csvCell).join(","));
  });
  return lines.join("\r\n") + "\r\n";
}
function downloadSjis(text, filename){
  const unicode = Encoding.stringToCode(text);
  const sjis = Encoding.convert(unicode, {to:"SJIS", from:"UNICODE"});
  const blob = new Blob([new Uint8Array(sjis)], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1500);
}
function stamp(){
  const d = new Date(), p = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`;
}

/* ===== イベント ===== */
$("btnParse").addEventListener("click", ()=>{
  const raw = $("paste").value.trim();
  if(!raw){ msg("貼り付けが空です。","err"); return; }
  const blocks = splitBlocks(raw);
  draft = blocks.map(b=>{
    const p = parseBlock(b);
    const built = buildAddr(p.pref, p.parts);
    return { zip:p.zip, name:p.name, a:built.a, item:S.defItem, overflow:built.overflow };
  }).filter(d => d.zip || d.name || d.a.some(x=>x));
  renderPreview();
  const ng = draft.filter(d=>!valid(d)).length;
  msg(ng ? `${draft.length}件に分けました。うち${ng}件は要修正（赤い欄）。` : `${draft.length}件に分けました。中身を見て問題なければ追加。`, ng?"err":"ok");
  $("preview").scrollIntoView({behavior:"smooth", block:"start"});
});

$("btnClear").addEventListener("click", ()=>{ $("paste").value=""; draft=[]; renderPreview(); msg(""); });

$("btnWipe").addEventListener("click", ()=>{
  if(!S.list.length) return;
  if(confirm(`リストの${S.list.length}件を全部消します。いい？`)){ S.list=[]; save(); renderList(); }
});

$("btnCsv").addEventListener("click", ()=>{
  const bad = S.list.map((d,i)=>valid(d)?null:i+1).filter(x=>x);
  if(bad.length){ msg(`${bad.join("・")}件目に不備があります（郵便番号7桁・氏名・住所・内容品）。`,"err"); return; }
  const chunks = [];
  for(let i=0;i<S.list.length;i+=MAX_ROWS) chunks.push(S.list.slice(i,i+MAX_ROWS));
  chunks.forEach((c,i)=>{
    const name = chunks.length>1 ? `clickpost_${stamp()}_${i+1}.csv` : `clickpost_${stamp()}.csv`;
    setTimeout(()=>downloadSjis(buildCsv(c), name), i*700);
  });
  msg(chunks.length>1 ? `${chunks.length}ファイルに分けて保存しました。` : "CSVを保存しました。クリックポストの「まとめ申込」で選んでください。","ok");
});

["defItem","header","keisho"].forEach(k=>{
  $(k).addEventListener("input", ()=>{ S[k] = $(k).value; save(); renderList(); });
  $(k).addEventListener("change", ()=>{ S[k] = $(k).value; save(); renderList(); });
});

/* ===== 起動 ===== */
load();
$("defItem").value = S.defItem;
$("header").value  = S.header;
$("keisho").value  = S.keisho;
renderList();

/* Chrome拡張のポップアップで開いているときだけ「広く使う」を出す */
(function(){
  const inExt = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id;
  const b = $("btnPopout");
  if(!inExt || !b) return;
  if(new URLSearchParams(location.search).has("w")) return;  // 別ウィンドウで開いた後は出さない
  b.hidden = false;
  b.addEventListener("click", ()=>{
    const url = chrome.runtime.getURL("popup.html?w=1");
    if(chrome.windows && chrome.windows.create){
      chrome.windows.create({url, type:"popup", width:480, height:900});
    }else{
      window.open(url, "_blank", "popup,width=480,height=900");
    }
    window.close();
  });
})();
