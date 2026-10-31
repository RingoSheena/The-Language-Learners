// src/lib/dictionary.js
// Answers lookups from JMdict on the server, plus an optional JPDB frequency list. Falls back to a small built-in
// starter list when the server can't be reached.
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
  // optional JPDB frequency list (Yomitan format). Used only to rank ambiguous matches.
  { url: BASE + "dict/term_meta_bank_1.json", kind: "freq", optional: true },
];

let DICT = { freq: new Map(), defs: new Map() };   // term -> [{r,v,disp}] / term -> [{r,gloss[]}] (dictionary files added locally)
let ready = null;

function gtext(g) {                      // Yomitan glossary items can be structured-content objects
  if (typeof g === "string") return g;
  if (Array.isArray(g)) return g.map(gtext).join(" ").replace(/\s+/g, " ").trim();
  if (g && typeof g === "object") return g.type === "image" ? "" : gtext(g.content ?? g.text ?? "");
  return "";
}

export function ingest(arr) {
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

// Cache the parsed files in IndexedDB so the big ones are only downloaded/parsed once.
// Change the name (v3 -> v4 ...) whenever ingest() or the data files change, so a stale cache is ignored.
// v2 held JMdict's common words, which now come from the server (see fetchEntries).
const idb = () => new Promise((res, rej) => { const r = indexedDB.open("jpdict-v3", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function saveCache() { try { (await idb()).transaction("kv", "readwrite").objectStore("kv").put(DICT, "dict"); } catch {} }
function loadCache() {
  try { indexedDB.deleteDatabase("jpdict-v2"); } catch {}
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
export const dictionaryStats = () => ({ fetched: found.size, defs: DICT.defs.size, freq: DICT.freq.size, builtin: BUILTIN.size });

// ---------------------------------------------------------------------------
// JMdict lives on the server (server/src/dictionary.js). One hover tries many spellings, so search() runs
// once to note every spelling it needs, they're fetched in one request, and search() runs again with them.
// ---------------------------------------------------------------------------
const found = new Map();                          // spelling -> JMdict entries [{r,gloss[],pos[],c}] ([] = not in it)
const MAX_FOUND = 50000;                          // forget old lookups past this, so a long session stays small
const LOOKUP_BATCH = 2000;                        // the server's limit per request
let missing = null;                               // spellings search() needed that aren't in `found`, while it runs

async function fetchEntries(terms) {
  if (found.size + terms.length > MAX_FOUND) found.clear();
  try {
    for (let i = 0; i < terms.length; i += LOOKUP_BATCH) {
      const batch = terms.slice(i, i + LOOKUP_BATCH);
      const r = await fetch("/api/dictionary/lookup", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terms: batch }) });
      if (!r.ok) { console.warn(`[dictionary] lookup -> HTTP ${r.status}`, (await r.json().catch(() => ({}))).error ?? ""); return false; }
      const { entries } = await r.json();
      for (const t of batch) found.set(t, entries[t] || []);
    }
    return true;
  } catch (e) {
    console.warn("[dictionary] lookup failed", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Deinflection: turn a conjugated form back into dictionary-form candidates.
// 食べました -> 食べる, 洗って -> 洗う, 楽しかった -> 楽しい, 青くて -> 青い ...
// Each candidate says what part of speech it must be (its "kind"), and only entries with that part of speech
// count, so generating extra wrong candidates is harmless: 読みます -> 読み is only a verb stem, never the
// noun 読み, and 書った -> 書く is no match because 書く doesn't conjugate that way.
// ---------------------------------------------------------------------------
const I2U = { い: "う", き: "く", ぎ: "ぐ", し: "す", ち: "つ", に: "ぬ", び: "ぶ", み: "む", り: "る" };   // 読み -> 読む
const A2U = { わ: "う", か: "く", が: "ぐ", さ: "す", た: "つ", な: "ぬ", ば: "ぶ", ま: "む", ら: "る" };   // 読ま(ない) -> 読む
const E2U = { え: "う", け: "く", げ: "ぐ", せ: "す", て: "つ", ね: "ぬ", べ: "ぶ", め: "む", れ: "る" };   // 書け(ば) -> 書く

// kind -> JMdict part-of-speech tags it allows (prefixes: "v5" is every godan verb, 行く's "v5k-s" included).
// "any" allows every word; "stem" is a verb stem, never a word on its own (stemForms turns it into one).
const KIND_POS = { v1: ["v1", "vk"], v5: ["v5"], "v5k-s": ["v5k-s"], vk: ["vk"], vs: ["vs"], "adj-i": ["adj-i"] };
const usable = k => k === "any" || KIND_POS[k];
const fits = (d, kinds) => kinds.has("any") || !d.pos                  // local/built-in entries have no pos
  || d.pos.some(p => [...kinds].some(k => KIND_POS[k]?.some(x => p.startsWith(x))));

// [ending, replacement, kind]
const SUFFIX_RULES = [
  ["ませんでした", "", "stem"], ["ましょう", "", "stem"], ["ました", "", "stem"], ["ません", "", "stem"], ["ます", "", "stem"],
  ["なかった", "", "stem"], ["なくて", "", "stem"], ["ない", "", "stem"], ["たかった", "", "stem"], ["たくない", "", "stem"], ["たい", "", "stem"],
  ["ながら", "", "stem"], ["たり", "", "stem"], ["だ", "", "any"], ["よ", "", "any"], ["ね", "", "any"],
  ["ていました", "て", "stem"], ["ています", "て", "stem"], ["ていた", "て", "stem"], ["ている", "て", "stem"],
  ["でいました", "で", "stem"], ["でいます", "で", "stem"], ["でいた", "で", "stem"], ["でいる", "で", "stem"],
  ["すれば", "する", "vs"], ["れば", "る", "v1"],
  ["ければ", "い", "adj-i"], ["くなかった", "い", "adj-i"], ["くない", "い", "adj-i"], ["かった", "い", "adj-i"],
  ["くて", "い", "adj-i"], ["かっ", "い", "adj-i"], ["く", "い", "adj-i"],
  // 行って, 行った: before う so 行く beats 行う, which is spelled the same and far less common
  ["って", "く", "v5k-s"], ["った", "く", "v5k-s"],
  ["って", "う", "v5"], ["って", "つ", "v5"], ["って", "る", "v5"], ["った", "う", "v5"], ["った", "つ", "v5"], ["った", "る", "v5"],
  ["んで", "ぬ", "v5"], ["んで", "ぶ", "v5"], ["んで", "む", "v5"], ["んだ", "ぬ", "v5"], ["んだ", "ぶ", "v5"], ["んだ", "む", "v5"],
  ["いて", "く", "v5"], ["いた", "く", "v5"], ["いで", "ぐ", "v5"], ["いだ", "ぐ", "v5"],
  ["して", "する", "vs"], ["した", "する", "vs"], ["して", "す", "v5"], ["した", "す", "v5"],
  ["て", "る", "v1"], ["た", "る", "v1"],
  // pieces the tokenizer splits off before て/た: 洗っ|て, 混ん|で, 書い|て
  ["っ", "う", "v5"], ["っ", "つ", "v5"], ["っ", "る", "v5"], ["っ", "く", "v5k-s"],
  ["ん", "ぬ", "v5"], ["ん", "ぶ", "v5"], ["ん", "む", "v5"], ["い", "く", "v5"], ["い", "ぐ", "v5"],
];

// candidate -> the kinds it may be
export function deinflect(s) {
  const out = new Map();
  const add = (c, kind) => { if (!c) return; const kinds = out.get(c); if (kinds) kinds.add(kind); else out.set(c, new Set([kind])); };
  const stemForms = x => {                       // x might be a bare verb stem
    const l = x.slice(-1), head = x.slice(0, -1);
    if (l === "し") add(head + "する", "vs");
    if (I2U[l]) add(head + I2U[l], "v5");
    if (A2U[l]) add(head + A2U[l], "v5");
    add(x + "る", "v1");
    if (x === "き" || x === "こ") add("くる", "vk");
  };
  add(s, "any");
  let frontier = [s];
  for (let depth = 0; depth < 3 && frontier.length && out.size < 300; depth++) {
    const next = [];
    for (const x of frontier) {
      const before = out.size;
      // only the text itself and in-between stems conjugate further: 書った -> 書く (行く's rule) -> 書い -> 書く
      // would otherwise turn a dictionary form back into a stem and out again as a verb it isn't
      if (![...out.get(x)].some(k => k === "any" || k === "stem")) continue;
      stemForms(x);
      if (x.endsWith("ば") && E2U[x.slice(-2, -1)]) add(x.slice(0, -2) + E2U[x.slice(-2, -1)], "v5");
      for (const [from, to, kind] of SUFFIX_RULES)
        if (x.length > from.length && x.endsWith(from)) add(x.slice(0, -from.length) + to, kind);
      next.push(...[...out.keys()].slice(before));
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
const isParticle = d => Boolean(d.pos?.includes("prt"));
const rank = w => Math.min(Infinity, ...(DICT.freq.get(w) || []).map(f => f.v));

function defsOf(w, kinds) {
  if (![...kinds].some(usable)) return [];
  if (missing && !found.has(w)) missing.add(w);
  const defs = found.get(w)?.length ? found.get(w) : DICT.defs.get(w) || BUILTIN.get(w) || [];
  return defs.filter(d => fits(d, kinds));
}

// Look up one string. Exact spelling wins; otherwise the best-ranked deinflected form, common words first.
// exactOnly skips deinflection, for text that can't be a conjugated word.
function lookupText(t, allowFreqOnly = false, exactOnly = false) {
  const cands = exactOnly ? new Map([[t, new Set(["any"])]]) : deinflect(t);
  const hits = [];
  for (const [w, kinds] of cands) { const defs = defsOf(w, kinds); if (defs.length) hits.push({ w, defs }); }
  if (hits.length) {
    const score = h => [rank(h.w), h.defs[0].c ?? 1];
    const best = hits[0].w === t ? hits[0] : hits.reduce((m, h) => {
      const [hr, hc] = score(h), [mr, mc] = score(m);
      return hr < mr || (hr === mr && hc < mc) ? h : m;
    });
    // は is also 歯 (tooth) and 葉 (leaf) in JMdict; a particle-shaped word is most likely the particle
    const defs = PARTICLES.has(best.w) ? [...best.defs].sort((a, b) => isParticle(b) - isParticle(a)) : best.defs;
    return { word: best.w, surface: t, freq: DICT.freq.get(best.w) || [], defs };
  }
  if (allowFreqOnly) for (const [w] of cands) {
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
  let result;
  for (let round = 0; ; round++) {
    missing = new Set();
    result = search(pieces, k, c);
    const terms = [...missing];
    missing = null;
    // a longer match found with the new entries can need spellings of its own, hence a few rounds
    if (!terms.length || round === 3 || !(await fetchEntries(terms))) break;   // server unreachable: keep what we have
  }
  if (!result.info) console.log("dictionary miss:", pieces[k].t);
  return result;
}

function search(pieces, k, c) {
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
      // a run starting with a particle is only a match as written (について): に|なって is に + なる, not 担う
      const info = lookupText(text, false, j > i && PARTICLES.has(pieces[i].t));
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
  return { info: null, i: k, j: k, text: tok };
}

// Single-string lookup (kept so older callers still work)
export async function lookupWord(surface) {
  return (await lookupAround([{ t: surface, w: true }], 0)).info;
}
