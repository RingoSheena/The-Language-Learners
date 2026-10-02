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
  { url: BASE + "dict/jmdict-eng.json", kind: "defs" },
  { url: BASE + "dict/term_meta_bank_1.json", kind: "freq" },
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
      const rd = w.kana?.[0]?.text ?? null;
      const gloss = (w.sense || []).map(x => x.gloss.map(g => g.text).join(", ")).filter(Boolean);
      const keys = (w.kanji || []).map(k => k.text);
      if (!keys.length || (w.sense || []).some(x => (x.misc || []).includes("uk"))) (w.kana || []).forEach(k => keys.push(k.text));
      for (const k of keys) { let a = DICT.defs.get(k); if (!a) DICT.defs.set(k, a = []); a.push({ r: rd, gloss }); }
    }
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

// Cache the parsed dictionary in IndexedDB so the big files are only downloaded/parsed once
const idb = () => new Promise((res, rej) => { const r = indexedDB.open("jpdict", 1);
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
      try { const r = await fetch(s.url); if (!r.ok) continue; ingest(await r.json()); got = true; } catch {}
    }
    if (got) saveCache();
  })();
  return ready;
}

// Optional: let users add a dictionary file manually
export async function loadDictionaryFile(file) { ingest(JSON.parse(await file.text())); saveCache(); }
export const dictionaryStats = () => ({ defs: DICT.defs.size, freq: DICT.freq.size, builtin: BUILTIN.size });

// Basic deinflection: 食べ -> 食べる, 読み -> 読む
const I2U = { い: "う", き: "く", ぎ: "ぐ", し: "す", ち: "つ", に: "ぬ", び: "ぶ", み: "む", り: "る" };
const candidates = s => { const c = [s], l = s.slice(-1); if (I2U[l]) c.push(s.slice(0, -1) + I2U[l]); c.push(s + "る"); return c; };

export async function lookupWord(surface) {
  if (ready) await ready;
  for (const w of candidates(surface)) {
    const freq = DICT.freq.get(w) || [];
    const defs = DICT.defs.get(w) || BUILTIN.get(w) || [];
    if (freq.length || defs.length) return { word: w, surface, freq, defs };
  }
  return null;
}
