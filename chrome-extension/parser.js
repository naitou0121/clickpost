/* 振り分けロジック（スマホ版・Chrome拡張の共通部品） */
/* ===== 定数 ===== */
const PREFS = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];
const ADDR_KW = /[都道府県市区町村郡丁目番地号条通ビル階棟室荘寮邸]|マンション|アパート|ハイツ|コーポ|メゾン|レジデンス|パレス|ハウス|タワー|プラザ|ヒルズ|方$/;
const BLDG_KW = /ビル|マンション|アパート|ハイツ|コーポ|メゾン|レジデンス|パレス|ハウス|タワー|プラザ|ヒルズ|荘$|階|号室|棟/;
const LIM_NAME = 20, LIM_ADDR = 20, LIM_ITEM = 15, MAX_ROWS = 40;

/* ===== 文字幅（全角1・半角0.5） ===== */
function w(s){let n=0;for(const c of String(s||"")){n += /[\x20-\x7E｡-ﾟ]/.test(c)?0.5:1;}return n;}
function toHalf(s){
  return String(s||"")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))
    .replace(/[‐‑‒–—―－−]/g,"-")
    .replace(/　/g," ");
}
function normNum(s){ // 番地まわりだけ半角化（氏名は触らない）
  return String(s||"").replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))
                      .replace(/[－−‐‑–—―]/g,"-").replace(/　/g," ").trim();
}

/* ===== 貼り付けテキスト → 件ごとに分割 ===== */
const ZIP_RE = /〒?\s*(\d{3})\s*[-‐‑–—―ー－−]?\s*(\d{4})(?![\d-])/;
const TEL_RE = /^[\d\-+() 　]+$/;
function splitBlocks(text){
  const norm = toHalf(text).replace(/\r\n?/g,"\n");
  // まず空行で切る
  let blocks = norm.split(/\n\s*\n+/).map(b=>b.trim()).filter(Boolean);
  // 空行が無いのに郵便番号が複数ある塊は、2つ目以降の郵便番号の手前で切る
  const out = [];
  for(const b of blocks){
    const lines = b.split("\n");
    let cur = [], seenZip = false;
    for(const ln of lines){
      const d = ln.replace(/[^\d]/g,"");
      const isTel = TEL_RE.test(ln.trim()) && d.length>=10 && d.length<=11;
      const hasZip = !isTel && ZIP_RE.test(ln);
      if(hasZip && seenZip && cur.length){ out.push(cur.join("\n")); cur = []; seenZip = false; }
      if(hasZip) seenZip = true;
      cur.push(ln);
    }
    if(cur.length) out.push(cur.join("\n"));
  }
  return out.map(b=>b.trim()).filter(Boolean);
}

/* ===== 1件ぶんの振り分け ===== */
function parseBlock(block){
  // 行 → カンマでも割る（「豊中市蛍池西町, 大阪府 560-0036」対策）
  let tokens = [];
  block.split("\n").forEach(line=>{
    line.split(/[,、，]/).forEach(t=>{ t = t.trim(); if(t) tokens.push(t); });
  });

  let zip = "", tel = "", pref = "";
  const rest = [], nameCand = [];

  tokens.forEach((t, idx)=>{
    // 国名
    if(/^(日本|JP|JPN|Japan|JAPAN)$/i.test(t)) return;
    // 敬称だけの行
    if(/^(様|御中|さん)$/.test(t)) return;
    // 電話番号（郵便番号より先に判定する：090-1234-5678 を〒と誤読しないため）
    const digits = t.replace(/[^\d]/g,"");
    if(TEL_RE.test(t) && digits.length>=10 && digits.length<=11){ if(!tel) tel = t; return; }
    if(/^(TEL|電話|Tel|phone|携帯)/i.test(t)){ if(!tel) tel = t; return; }

    // 郵便番号を抜く
    const m = t.match(ZIP_RE);
    if(m){
      if(!zip) zip = m[1] + m[2];
      t = t.replace(ZIP_RE,"").replace(/〒/g,"").trim();
      if(!t) return;
    }

    // 都道府県
    const p = PREFS.find(pp => t === pp || t.startsWith(pp));
    if(p){
      if(!pref){
        pref = p;
        const tail = t.slice(p.length).trim();
        if(tail) rest.push(tail);
        return;
      }
      if(t === pref) return;                 // 同じ都道府県が2回出てきたら捨てる
      const tail = t.slice(p.length).trim();
      if(tail){ rest.push(tail); return; }
      return;
    }
    // 氏名候補：数字なし・住所語なし・20字以内
    if(!/\d/.test(t) && !ADDR_KW.test(t) && w(t) <= 20){
      nameCand.push({t, idx});
      return;
    }
    rest.push(t);
  });

  // 氏名候補のスコアリング（建物名を氏名と誤認しないため）
  let name = "";
  if(nameCand.length){
    const last = tokens.length - 1;
    const scored = nameCand.map(c=>{
      let s = 0;
      const len = c.t.replace(/\s/g,"").length;
      if(len>=2 && len<=6) s += 3; else if(len<=8) s += 1; else s -= 2;
      if(/^[一-鿿々\s]+$/.test(c.t)) s += 3;                 // 漢字だけ＝人名っぽい
      if(/^[ぁ-んァ-ヶー一-鿿\s]+$/.test(c.t)) s += 1;
      if(BLDG_KW.test(c.t)) s -= 6;                                       // 建物語
      if(/[ァ-ヶ]{4,}/.test(c.t)) s -= 3;                                 // 長いカタカナ＝建物名
      if(/[A-Za-z]/.test(c.t)) s -= 2;
      if(c.idx === last || c.idx === 0) s += 2;                           // 先頭か末尾
      return {...c, s};
    }).sort((a,b)=>b.s-a.s);
    name = scored[0].t.replace(/\s*(様|さん|御中)$/,"").trim();
    scored.slice(1).forEach(c=>rest.push(c.t));                           // 残りは住所へ戻す
  }

  return { zip, name, pref, parts: rest.map(normNum), tel };
}

/* ===== 住所を4行（各全角20字）に詰める ===== */
function splitWide(s, lim){
  const out = [];
  let cur = "";
  for(const ch of s){
    if(w(cur+ch) > lim){ out.push(cur); cur = ch; } else cur += ch;
  }
  if(cur) out.push(cur);
  return out;
}
function rankOf(p){
  if(/^[^0-9]+[市区町村郡]$/.test(p)) return 0;      // 「豊中市」「渋谷区」だけの塊
  if(/[市区町村郡]/.test(p)) return 1;               // 市区町村＋町域
  if(BLDG_KW.test(p)) return 3;                      // 建物・部屋
  return 2;                                          // 番地など
}
function buildAddr(pref, parts){
  let units = [];
  if(pref) units.push(pref);
  const sorted = parts.filter(Boolean)
    .map((p,i)=>({p,i,r:rankOf(p)}))
    .sort((a,b)=> a.r-b.r || a.i-b.i)
    .map(o=>o.p);
  sorted.forEach(p=>units.push(p));
  // 長すぎる単位はその場で割る
  let flat = [];
  units.forEach(u=>{ (w(u)>LIM_ADDR ? splitWide(u,LIM_ADDR) : [u]).forEach(x=>flat.push(x)); });
  // 4枠を超えるぶんは、入るところに連結して畳む
  while(flat.length > 4){
    let merged = false;
    for(let i=flat.length-1;i>0;i--){
      if(w(flat[i-1]+flat[i]) <= LIM_ADDR){ flat[i-1] = flat[i-1]+flat[i]; flat.splice(i,1); merged = true; break; }
    }
    if(!merged) break; // どうしても入らない → 5行目以降は落ちる（画面で赤く出す）
  }
  const a = [flat[0]||"", flat[1]||"", flat[2]||"", flat[3]||""];
  return { a, overflow: flat.slice(4).join("") };
}
