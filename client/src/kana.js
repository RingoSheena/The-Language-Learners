// Kana-only words (ねこ, コーヒー) already show how they're read, so a
// separate reading would just repeat them. ー, ・ and ｰ are Unicode "common"
// script rather than kana, but only appear in kana words.
const KANA_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・ｰ\s]+$/u

export function isKanaOnly(text) {
  return KANA_ONLY.test(String(text ?? '').trim())
}

// Whole words where the kana spelling differs from how it is pronounced
// (the particle は is read "wa" here).
const ROMAJI_EXCEPTIONS = {
  こんにちは: 'konnichiwa',
  こんばんは: 'konbanwa',
}

const KANA_ROMAJI = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
  ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゎ: 'wa',
}

const KANA_COMBO_ROMAJI = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo',
  しゃ: 'sha', しゅ: 'shu', しぇ: 'she', しょ: 'sho',
  ちゃ: 'cha', ちゅ: 'chu', ちぇ: 'che', ちょ: 'cho',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'ja', じゅ: 'ju', じぇ: 'je', じょ: 'jo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo',
  ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo',
  てぃ: 'ti', でぃ: 'di',
  うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
}

// Katakana to hiragana, so one table covers both. ヴ (U+30F4) maps to ゔ.
const toHiragana = (text) =>
  text.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))

// Kana to romaji, for showing how a word is pronounced: こんにちは ->
// "konnichiwa". Long vowels are spelled out (とうきょう -> "toukyou", コーヒー
// -> "koohii") rather than written with macrons. Returns '' when the text has
// anything that can't be converted (like kanji), so nothing wrong is shown.
export function kanaToRomaji(text) {
  if (!text) return ''
  const hira = toHiragana(String(text).trim())
  if (ROMAJI_EXCEPTIONS[hira]) return ROMAJI_EXCEPTIONS[hira]

  let out = ''
  let doubleNext = false
  let lastWasN = false
  let i = 0

  while (i < hira.length) {
    const char = hira[i]

    // Small っ doubles the next consonant: がっこう -> gakkou
    if (char === 'っ') {
      doubleNext = true
      i += 1
      continue
    }

    // ー repeats the vowel before it: コーヒー -> koohii
    if (char === 'ー') {
      const last = out.slice(-1)
      if (last && 'aiueo'.includes(last)) out += last
      i += 1
      continue
    }

    let romaji
    const pair = hira.slice(i, i + 2)
    if (KANA_COMBO_ROMAJI[pair]) {
      romaji = KANA_COMBO_ROMAJI[pair]
      i += 2
    } else if (KANA_ROMAJI[char]) {
      romaji = KANA_ROMAJI[char]
      i += 1
    } else {
      // Spaces and punctuation pass through; anything else is caught below
      out += char
      lastWasN = false
      i += 1
      continue
    }

    if (doubleNext) {
      romaji = romaji.startsWith('ch') ? `t${romaji}` : `${romaji[0]}${romaji}`
      doubleNext = false
    }
    // ん before a vowel or "y" needs an apostrophe: かんい -> kan'i
    if (lastWasN && /^[aiueoy]/.test(romaji)) out += "'"

    out += romaji
    lastWasN = char === 'ん'
  }

  // Leftover non-ASCII means something (like kanji) wasn't converted
  return /\P{ASCII}/u.test(out) ? '' : out
}

// Longest-match transliteration preserves unknown input so typos cannot vanish.
const ROMAJI_KANA = Object.fromEntries(
  [...Object.entries(KANA_ROMAJI), ...Object.entries(KANA_COMBO_ROMAJI)]
    .filter(([kana]) => !'ぁぃぅぇぉゃゅょゎゐゑぢづ'.includes(kana))
    .map(([kana, romaji]) => [romaji, kana])
)
Object.assign(ROMAJI_KANA, { shi: 'し', chi: 'ち', tsu: 'つ', ji: 'じ', si: 'し', ti: 'ち', tu: 'つ', hu: 'ふ', zi: 'じ', wo: 'を', nn: 'ん', "n'": 'ん', '-': 'ー' })
const ROMAJI_KEYS = Object.keys(ROMAJI_KANA).sort((a, b) => b.length - a.length)

export function romajiToKana(text) {
  const input = String(text ?? '').normalize('NFKC').toLowerCase().trim()
  let output = ''
  for (let i = 0; i < input.length;) {
    const rest = input.slice(i)
    if (/^nn[aeiouy]/.test(rest)) {
      output += 'ん'
      i += 1
    } else if (/^([bcdfghjkmprstvwxyz])\1/.test(rest)) {
      output += 'っ'
      i += 1
    } else if (/^n(?:$|[^aeiouyn'])/.test(rest)) {
      output += 'ん'
      i += 1
    } else {
      const key = ROMAJI_KEYS.find((candidate) => rest.startsWith(candidate))
      output += key ? ROMAJI_KANA[key] : input[i]
      i += key ? key.length : 1
    }
  }
  return output
}

export function checkReadingAnswer(answer, reading) {
  const normalize = (value) => toHiragana(romajiToKana(value)).normalize('NFC')
  const expected = normalize(reading)
  return Boolean(expected && isKanaOnly(expected) && normalize(answer) === expected)
}
