// src/lib/dictionary.js
// Loads dictionary data (JMdict + optional JPDB frequency) and answers lookups. Falls back to a small built-in starter list.
const BUILTIN_TXT = `は|は (wa)|topic marker particle
が|が|subject marker particle
を|を (o)|object marker particle
に|に|particle: at, in, to, for (direction, time, target)
で|で|particle: at, by means of, in (location of action)
と|と|particle: and, with; quotation marker
も|も|particle: also, too
の|の|possessive/nominalizing particle: 's, of; the one that
から|から|from; because
まで|まで|until, up to, as far as
へ|へ (e)|particle: toward, to
や|や|and (non-exhaustive list)
か|か|question marker; or
よ|よ|sentence-ending particle: emphasis
ね|ね|sentence-ending particle: isn't it? right?
です|です|to be (polite copula)
ます|ます|polite verb ending
だ|だ|to be (plain copula)
私|わたし|I; me
僕|ぼく|I; me (used by males)
あなた|あなた|you
彼|かれ|he; him; boyfriend
彼女|かのじょ|she; her; girlfriend
これ|これ|this (thing near me)
それ|それ|that (thing near you)
あれ|あれ|that (thing over there)
ここ|ここ|here
そこ|そこ|there
どこ|どこ|where
何|なに|what
誰|だれ|who
いつ|いつ|when
なぜ|なぜ|why
人|ひと|person; people
友達|ともだち|friend
先生|せんせい|teacher; doctor; master
学生|がくせい|student
学校|がっこう|school
会社|かいしゃ|company; office
仕事|しごと|work; job; occupation
家|いえ|house; home
国|くに|country; nation
町|まち|town; city
世界|せかい|the world
日本|にほん|Japan
日本語|にほんご|Japanese language
英語|えいご|English language
言葉|ことば|word; language
名前|なまえ|name
本|ほん|book
水|みず|water
猫|ねこ|cat
犬|いぬ|dog
車|くるま|car; vehicle
電車|でんしゃ|electric train
駅|えき|station
天気|てんき|weather
雨|あめ|rain
朝|あさ|morning
昼|ひる|noon; daytime
夜|よる|evening; night
今日|きょう|today
明日|あした|tomorrow
昨日|きのう|yesterday
毎日|まいにち|every day
今|いま|now
時間|じかん|time; hours
時|とき|time; moment; when
年|とし|year; age
月|つき|moon; month
日|ひ|day; sun
前|まえ|before; in front of
後|あと|after; behind; later
中|なか|inside; in; among
上|うえ|above; on top; up
下|した|below; under; down
顔|かお|face
手|て|hand; arm
目|め|eye
心|こころ|heart; mind; spirit
愛|あい|love; affection
夢|ゆめ|dream
物|もの|thing; object
事|こと|thing; matter; fact
所|ところ|place; spot
食べ物|たべもの|food
飲み物|のみもの|drink; beverage
食べる|たべる|to eat
飲む|のむ|to drink
読む|よむ|to read
書く|かく|to write
見る|みる|to see; to look; to watch
聞く|きく|to hear; to listen; to ask
話す|はなす|to speak; to talk
行く|いく|to go
来る|くる|to come
する|する|to do; to make
ある|ある|to exist (inanimate); to have
いる|いる|to exist (animate); to be
なる|なる|to become
言う|いう|to say; to call
思う|おもう|to think; to feel
知る|しる|to know; to get to know
分かる|わかる|to understand; to be clear
勉強|べんきょう|study; diligence
好き|すき|liked; fond of; favorite
大きい|おおきい|big; large
小さい|ちいさい|small; little
新しい|あたらしい|new
古い|ふるい|old (not for people)
高い|たかい|high; tall; expensive
安い|やすい|cheap; inexpensive
良い|よい|good; nice
悪い|わるい|bad; poor
美味しい|おいしい|delicious; tasty
楽しい|たのしい|enjoyable; fun
嬉しい|うれしい|happy; glad
とても|とても|very; extremely
たくさん|たくさん|many; much; a lot
少し|すこし|a little; a few
全部|ぜんぶ|all; entire; whole`;
const BUILTIN = new Map();
BUILTIN_TXT.split("\n").forEach(l => { const [w, r, d] = l.split("|"); if (d) BUILTIN.set(w, [{ r, gloss: [d] }]); });

const BASE = import.meta.env?.BASE_URL ?? "/";
const SOURCES = [                       // files live in public/dict/
  // jmdict-simplified "common" build. Unzip it and rename the .json inside to exactly this name.
  { url: BASE + "dict/jmdict-eng-common.json", kind: "defs" },
  // optional JPDB frequency list (Yomitan format). Used only to rank ambiguous matches.
  { url: BASE + "dict/term_meta_bank_1.json", kind: "freq", optional: true },
];

let DICT = { freq: new Map(), defs: new Map() };   // term -> [{r,v,disp}] / term -> [{r,gloss[]}]
let ready = null;

function gtext(g) {                      // Yomitan glossary items can be structured-content objects
  if (typeof g === "string") return g;
  if (Array.isArray(g)) return g.map(gtext).join(" ").replace(/\s+/g, " ").trim();
  if (g && typeof g === "object") return g.type === "image" ? "" : gtext(g.content ?? g.text ?? "");
  return "";
}

export function ingest(arr) {
  if (arr && Array.isArray(arr.words)) {                         // jmdict-simplified format
    for (const w of arr.words) {
      const gloss = (w.sense || []).map(x => x.gloss.map(g => g.text).join(", ")).filter(Boolean);
      const entry = {                                            // one object, shared by every key below
        r: w.kana?.[0]?.text ?? null,
        gloss,
        c: (w.kanji?.[0]?.common || w.kana?.[0]?.common) ? 0 : 1,   // common words sort first
      };
      // index kanji AND kana spellings, so text written in kana (おいしい, かわいい...) is found too
      const keys = new Set([...(w.kanji || []), ...(w.kana || [])].map(k => k.text));
      for (const k of keys) { let a = DICT.defs.get(k); if (!a) DICT.defs.set(k, a = []); a.push(entry); }
    }
    for (const a of DICT.defs.values()) if (a.length > 1) a.sort((x, y) => (x.c ?? 1) - (y.c ?? 1));
    return;
  }
  if (!Array.isArray(arr) || !arr.length || !Array.isArray(arr[0])) return;
  if (arr[0][1] === "freq") {                                    // Yomitan term_meta_bank (JPDB)
    for (const e of arr) {
      if (e[1] !== "freq") continue;
      let d = e[2], r = null;
      if (d && d.frequency !== undefined) { r = d.reading || null; d = d.frequency; }
      const v = typeof d === "object" ? d.value : d;
      const disp = typeof d === "object" ? (d.displayValue || String(d.value)) : String(d);
      let a = DICT.freq.get(e[0]); if (!a) DICT.freq.set(e[0], a = []); a.push({ r, v, disp });
    }
  } else if (Array.isArray(arr[0][5])) {                         // Yomitan term_bank
    for (const e of arr) {
      let a = DICT.defs.get(e[0]); if (!a) DICT.defs.set(e[0], a = []);
      a.push({ r: e[1] || null, gloss: e[5].map(gtext).filter(Boolean) });
    }
  }
}

// Cache the parsed dictionary in IndexedDB so the big files are only downloaded/parsed once.
// Change the name (v2 -> v3 ...) whenever ingest() or the data files change, so a stale cache is ignored.
const idb = () => new Promise((res, rej) => { const r = indexedDB.open("jpdict-v2", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function saveCache() { try { (await idb()).transaction("kv", "readwrite").objectStore("kv").put(DICT, "dict"); } catch {} }
function loadCache() {
  return new Promise(res => { idb().then(db => { const q = db.transaction("kv").objectStore("kv").get("dict");
    q.onsuccess = () => { if (q.result) DICT = q.result; res(); }; q.onerror = () => res(); }).catch(() => res()); });
}

export function initDictionary() {
  if (!ready) ready = (async () => {
    await loadCache();
    let got = false;
    for (const s of SOURCES) {
      if (s.kind === "freq" ? DICT.freq.size : DICT.defs.size) continue;   // already cached
      try {
        const r = await fetch(s.url);
        if (!r.ok) { (s.optional ? console.info : console.warn)(`[dictionary] ${s.url} -> HTTP ${r.status}`); continue; }
        ingest(await r.json()); got = true;
      } catch (e) {   // a missing file makes Vite answer with index.html, which fails JSON parsing
        (s.optional ? console.info : console.warn)(`[dictionary] could not load ${s.url}. Is the unzipped .json in public/dict/ with exactly this name?`, e);
      }
    }
    if (got) saveCache();
    console.info("[dictionary] ready", dictionaryStats());
  })();
  return ready;
}

// Optional: let users add a dictionary file manually
export async function loadDictionaryFile(file) { ingest(JSON.parse(await file.text())); saveCache(); }
export const dictionaryStats = () => ({ defs: DICT.defs.size, freq: DICT.freq.size, builtin: BUILTIN.size });

// ---------------------------------------------------------------------------
// Deinflection: turn a conjugated form back into dictionary-form candidates.
// 食べました -> 食べる, 洗って -> 洗う, 楽しかった -> 楽しい, 青くて -> 青い ...
// Every candidate is checked against the dictionary, so generating extra wrong ones is harmless.
// ---------------------------------------------------------------------------
const I2U = { い: "う", き: "く", ぎ: "ぐ", し: "す", ち: "つ", に: "ぬ", び: "ぶ", み: "む", り: "る" };   // 読み -> 読む
const A2U = { わ: "う", か: "く", が: "ぐ", さ: "す", た: "つ", な: "ぬ", ば: "ぶ", ま: "む", ら: "る" };   // 読ま(ない) -> 読む

// [ending, replacement]; "" means "what is left is a verb stem" (stemForms handles it)
const SUFFIX_RULES = [
  ["ませんでした", ""], ["ましょう", ""], ["ました", ""], ["ません", ""], ["ます", ""],
  ["なかった", ""], ["なくて", ""], ["ない", ""], ["たかった", ""], ["たくない", ""], ["たい", ""],
  ["ながら", ""], ["たり", ""], ["だ", ""], ["よ", ""], ["ね", ""],
  ["ていました", "て"], ["ています", "て"], ["ていた", "て"], ["ている", "て"],
  ["でいました", "で"], ["でいます", "で"], ["でいた", "で"], ["でいる", "で"],
  ["すれば", "する"], ["れば", "る"], ["ければ", "い"],
  ["くなかった", "い"], ["くない", "い"], ["かった", "い"], ["くて", "い"], ["かっ", "い"], ["く", "い"],
  ["って", "う"], ["って", "つ"], ["って", "る"], ["った", "う"], ["った", "つ"], ["った", "る"],
  ["んで", "ぬ"], ["んで", "ぶ"], ["んで", "む"], ["んだ", "ぬ"], ["んだ", "ぶ"], ["んだ", "む"],
  ["いて", "く"], ["いた", "く"], ["いで", "ぐ"], ["いだ", "ぐ"],
  ["して", "する"], ["した", "する"], ["して", "す"], ["した", "す"],
  ["て", "る"], ["た", "る"],
  // pieces the tokenizer splits off before て/た: 洗っ|て, 混ん|で, 書い|て
  ["っ", "う"], ["っ", "つ"], ["っ", "る"], ["ん", "ぬ"], ["ん", "ぶ"], ["ん", "む"], ["い", "く"], ["い", "ぐ"],
];

function deinflect(s) {
  const out = [], seen = new Set();
  const add = c => { if (c && !seen.has(c)) { seen.add(c); out.push(c); } };
  const stemForms = x => {                       // x might be a bare verb stem
    const l = x.slice(-1), head = x.slice(0, -1);
    if (l === "し") add(head + "する");
    if (I2U[l]) add(head + I2U[l]);
    if (A2U[l]) add(head + A2U[l]);
    add(x + "る");
    if (x === "き" || x === "こ") add("くる");
  };
  add(s);
  let frontier = [s];
  for (let depth = 0; depth < 3 && frontier.length && out.length < 300; depth++) {
    const next = [];
    for (const x of frontier) {
      const before = out.length;
      stemForms(x);
      for (const [from, to] of SUFFIX_RULES)
        if (x.length > from.length && x.endsWith(from)) add(x.slice(0, -from.length) + to);
      next.push(...out.slice(before));
    }
    frontier = next;
  }
  return out;
}

// Grammar pieces that are not dictionary words (only used when nothing else matches)
const GRAMMAR = new Map(Object.entries({
  まし: "polite ending (-ます, past stem): …", ませ: "polite ending (-ます, negative stem): …",
  ました: "polite past ending: did …", ません: "polite negative ending: does not …",
  ませんでした: "polite past negative: did not …", ましょう: "polite volitional: let's …",
  でした: "polite past of です: was / were", でしょう: "probably; right? (polite)",
  ている: "-ing / ongoing state (て-form + いる)", ています: "-ing / ongoing state (polite)",
  ていた: "was -ing / had been …", ていました: "was -ing (polite)",
  ながら: "while …-ing", ので: "because; so", のに: "even though; in order to",
  けど: "but; although", けれど: "but; although", たり: "do things like …",
  だった: "was (plain past of だ)", ですが: "but (polite)", ますが: "but (polite)",
  って: "quotation / casual て-form ending", っ: "small っ: part of a て/た form (洗って, 行った)",
  ん: "part of a て/た form (読んで) or negative (ん = ない)", ず: "negative (literary): without …",
}));

const PARTICLES = new Set(["は", "が", "を", "に", "で", "と", "も", "の", "へ", "や", "から", "まで", "より", "ね", "よ", "わ", "ぞ", "ぜ"]);
const KANJI = /[㐀-鿿]/;
const MAX_SPAN = 10;                              // characters
const defsOf = w => DICT.defs.get(w) || BUILTIN.get(w) || [];
const rank = w => Math.min(Infinity, ...(DICT.freq.get(w) || []).map(f => f.v));

// Look up one string. Exact spelling wins; otherwise the best-ranked deinflected form.
function lookupText(t, allowFreqOnly = false) {
  const cands = deinflect(t);
  const hits = cands.filter(w => defsOf(w).length);
  if (hits.length) {
    const w = defsOf(t).length ? t : hits.reduce((m, x) => (rank(x) < rank(m) ? x : m));
    return { word: w, surface: t, freq: DICT.freq.get(w) || [], defs: defsOf(w) };
  }
  if (allowFreqOnly) for (const w of cands) {
    const freq = DICT.freq.get(w);
    if (freq?.length) return { word: w, surface: t, freq, defs: [] };
  }
  return null;
}

/**
 * Intl.Segmenter splits conjugated words into pieces (食 | べ | ます, 青 | く | て), so a lookup of one
 * piece can't work. Given all pieces of the paragraph ([{ t: text, w: isWordLike }]) and the index k of the
 * hovered piece, try every run of neighbouring pieces that includes k and return the longest dictionary match.
 * Result: { info, i, j, text }  (pieces i..j matched; info is null when nothing was found)
 */
export async function lookupAround(pieces, k, c = 0) {   // c = index of the hovered character inside piece k
  if (ready) await ready;
  const tok = pieces[k].t;
  let lo = k, hi = k;                             // only merge neighbours that are word-like (no punctuation / spaces)
  while (lo > 0 && pieces[lo - 1].w && k - (lo - 1) <= 7) lo--;
  while (hi < pieces.length - 1 && pieces[hi + 1].w && (hi + 1) - k <= 8) hi++;

  let best = null;
  const starts = PARTICLES.has(tok) ? [k] : Array.from({ length: k - lo + 1 }, (_, n) => k - n);   // particles never merge backwards
  for (const i of starts) {
    for (let j = hi; j >= k; j--) {
      const text = pieces.slice(i, j + 1).map(p => p.t).join("");
      if (text.length > MAX_SPAN || (best && text.length <= best.text.length)) continue;
      const info = lookupText(text);
      if (info) { best = { info, i, j, text }; break; }                 // longest end for this start
    }
  }
  if (best) return best;

  // The tokenizer sometimes glues particles on (桜の, 木の下, 時に). Try parts of the piece around the hovered
  // character, longest first. A part must contain kanji or be a particle, so names (けんさん) stay "not found".
  for (let len = tok.length - 1; len >= 1; len--) {
    for (let a = Math.max(0, c - len + 1); a <= Math.min(c, tok.length - len); a++) {
      const sub = tok.slice(a, a + len);
      if (!KANJI.test(sub) && !PARTICLES.has(sub)) continue;
      const info = lookupText(sub);
      if (info) return { info, i: k, j: k, text: tok };
    }
  }
  const info = lookupText(tok, true);
  if (info) return { info, i: k, j: k, text: tok };
  const g = GRAMMAR.get(tok);
  if (g) return { info: { word: tok, surface: tok, freq: [], defs: [{ r: null, gloss: [g] }] }, i: k, j: k, text: tok };
  console.log("dictionary miss:", tok);
  return { info: null, i: k, j: k, text: tok };
}

// Single-string lookup (kept so older callers still work)
export async function lookupWord(surface) {
  return (await lookupAround([{ t: surface, w: true }], 0)).info;
}
