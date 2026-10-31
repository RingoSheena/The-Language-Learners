// JMdict entries, in the jmdict-simplified JSON format, turned into what the
// reader's definition popup shows. Pure functions, so they're easy to test;
// scripts/import-jmdict.js and dictionary.js do the file and database work.

// The parts of an entry the popup uses, to keep the database small. A
// sense with no part of speech has the same one as the sense before it.
export function compactWord(word) {
  let partOfSpeech = []
  return {
    kanji: word.kanji.map(({ text, common }) => ({ text, common })),
    kana: word.kana.map(({ text, common, appliesToKanji }) => ({ text, common, appliesToKanji })),
    sense: word.sense.map((sense) => {
      if (sense.partOfSpeech.length > 0) partOfSpeech = sense.partOfSpeech
      return {
        partOfSpeech,
        appliesToKanji: sense.appliesToKanji,
        appliesToKana: sense.appliesToKana,
        gloss: sense.gloss.map((gloss) => gloss.text),
        // "usually written using kana alone"
        ...(sense.misc.includes('uk') && { uk: true }),
      }
    }),
  }
}

// Every spelling an entry can be looked up by, kanji and kana, so text
// written in kana (おいしい, かわいい) is found too
export function wordSpellings(word) {
  const spellings = new Map()
  for (const { text, common } of [...word.kanji, ...word.kana]) {
    spellings.set(text, spellings.get(text) || common)
  }
  return [...spellings].map(([text, common]) => ({ text, common }))
}

const appliesTo = (list, text) => list.includes('*') || list.includes(text)

// One entry as the popup shows it for one spelling: the reading that goes
// with that spelling, and only the senses that apply to it.
//   r     -- reading
//   gloss -- one string per sense
//   pos   -- parts of speech, used to check conjugations (see dictionary.js
//            in the client)
//   c     -- 0 when this spelling is a common one, so those sort first
//   uk    -- for a kana spelling, whether the word is normally written that
//            way (it has no kanji, or JMdict says it's usually kana)
export function formatEntry(word, term) {
  const kanji = word.kanji.find((k) => k.text === term)
  const kana = word.kana.find((k) => k.text === term)
  const senses = word.sense.filter((sense) =>
    kanji ? appliesTo(sense.appliesToKanji, term) : appliesTo(sense.appliesToKana, term)
  )
  return {
    r: kanji ? (word.kana.find((k) => appliesTo(k.appliesToKanji, term))?.text ?? null) : term,
    gloss: senses.map((sense) => sense.gloss.join(', ')).filter(Boolean),
    pos: [...new Set(senses.flatMap((sense) => sense.partOfSpeech))],
    c: (kanji ?? kana)?.common ? 0 : 1,
    uk: !kanji && (word.kanji.length === 0 || senses.some((sense) => sense.uk)),
  }
}
