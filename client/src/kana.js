// Kana-only words (ねこ, コーヒー) already show how they're read, so a
// separate reading would just repeat them. ー, ・ and ｰ are Unicode "common"
// script rather than kana, but only appear in kana words.
const KANA_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・ｰ\s]+$/u

export function isKanaOnly(text) {
  return KANA_ONLY.test(String(text ?? '').trim())
}
