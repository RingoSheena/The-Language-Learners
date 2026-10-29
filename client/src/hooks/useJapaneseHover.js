// src/hooks/useJapaneseHover.js
// Hover-to-define for book text rendered inside an <iframe> (like Reader.jsx's srcDoc iframe).
import { useCallback, useEffect, useRef, useState } from "react";
import { initDictionary, lookupAround } from "../lib/dictionary";

const seg = new Intl.Segmenter("ja", { granularity: "word" });   // tokenization
const BLOCK = "p,div,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt";
const SKIP = "rt,rp";                                            // furigana is never part of the word text

const HOTKEY_STORAGE_KEY = "jpDefHotkey";
const DEFAULT_HOTKEY = "AltLeft";
// A hold-to-activate key has to be a modifier -- anything else would
// collide with normal typing/shortcuts elsewhere on the page.
export const HOTKEY_OPTIONS = [
  { code: "AltLeft", label: "Left Alt" },
  { code: "AltRight", label: "Right Alt" },
  { code: "ControlLeft", label: "Left Ctrl" },
  { code: "ControlRight", label: "Right Ctrl" },
  { code: "ShiftLeft", label: "Left Shift" },
  { code: "ShiftRight", label: "Right Shift" },
];

/** Persisted choice of hold-to-define key, defaulting to left Alt. */
export function useDefinitionHotkey() {
  const [hotkey, setHotkeyState] = useState(() => {
    try {
      const saved = localStorage.getItem(HOTKEY_STORAGE_KEY);
      return HOTKEY_OPTIONS.some(o => o.code === saved) ? saved : DEFAULT_HOTKEY;
    } catch {
      return DEFAULT_HOTKEY;
    }
  });

  const setHotkey = code => {
    setHotkeyState(code);
    try { localStorage.setItem(HOTKEY_STORAGE_KEY, code); } catch {}
  };

  return [hotkey, setHotkey];
}

function caretAt(doc, x, y) {
  if (doc.caretPositionFromPoint) { const p = doc.caretPositionFromPoint(x, y); return p && [p.offsetNode, p.offset]; }
  if (doc.caretRangeFromPoint) { const r = doc.caretRangeFromPoint(x, y); return r && [r.startContainer, r.startOffset]; }
  return null;
}

// Map a character index in the block's joined text back to a (textNode, offset)
function pos(nodes, g, isEnd) {
  for (const { n, start } of nodes) {
    const len = n.data.length;
    if (isEnd ? g > start && g <= start + len : g >= start && g < start + len) return [n, g - start];
  }
  return null;
}

// Joins the paragraph's text (skipping <rt> furigana) so words spanning several <ruby> elements stay whole.
function tokenAt(doc, x, y) {
  const c = caretAt(doc, x, y);
  if (!c) return null;
  const [node, off] = c;
  if (node.nodeType !== 3 || node.parentElement?.closest(SKIP)) return null;
  const block = node.parentElement.closest(BLOCK) || doc.body;

  const nodes = []; let text = "", g = -1;
  const tw = doc.createTreeWalker(block, 4 /* SHOW_TEXT */, {
    acceptNode: n => (n.parentElement?.closest(SKIP) ? 2 /* REJECT */ : 1 /* ACCEPT */),
  });
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    nodes.push({ n, start: text.length });
    if (n === node) g = text.length + off;
    text += n.data;
  }
  if (g < 0) return null;

  const segs = [...seg.segment(text)];
  const rangeFor = (i, j) => {                                    // DOM range covering pieces i..j
    const a = pos(nodes, segs[i].index, false), b = pos(nodes, segs[j].index + segs[j].segment.length, true);
    if (!a || !b) return null;
    const r = doc.createRange(); r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]);
    return r;
  };
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k];
    if (s.index > g) break;
    if (!s.isWordLike || g > s.index + s.segment.length) continue;
    const range = rangeFor(k, k);
    if (!range) continue;
    for (const r of range.getClientRects())                       // pointer must really be over this word
      if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2)
        // Intl.Segmenter splits conjugations (食|べ|ます), so keep every piece (segs) and the hovered one (k, c):
        // lookupAround() merges neighbouring pieces into the longest dictionary match.
        return { range, text: s.segment, block, idx: s.index, segs, k, c: Math.min(Math.max(0, g - s.index), s.segment.length - 1), rangeFor };
  }
  return null;
}

const highlight = (doc, range) => {
  const w = doc.defaultView;
  if (w.CSS?.highlights) w.CSS.highlights.set("jp-token", new w.Highlight(range));   // needs ::highlight(jp-token) CSS inside the iframe
  else { const s = doc.getSelection(); s.removeAllRanges(); s.addRange(range); }
};
const clearHighlight = doc => { try { doc?.defaultView?.CSS?.highlights?.delete("jp-token"); } catch {} };

/**
 * const { popup, attach } = useJapaneseHover(iframeRef, { hotkey })
 * Call attach(iframe) every time the iframe finishes loading.
 *
 * Hold `hotkey` (a KeyboardEvent.code, default "AltLeft") over a word to
 * highlight it and look it up -- plain hovering with the key up does
 * neither. The popup then stays open -- releasing the key does not
 * close it -- until the user clicks outside it (or scrolls, or presses
 * the hotkey over a different word).
 */
export function useJapaneseHover(iframeRef, { dwellMs = 250, hotkey = "AltLeft" } = {}) {
  const [popup, setPopup] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);
  enabledRef.current = enabled;
  const timerRef = useRef(null);
  const cleanupRef = useRef(null);
  const triggerRef = useRef(null);    // re-runs the lookup for whatever's under the cursor right now

  const close = useCallback(() => {
    clearTimeout(timerRef.current);
    setPopup(null);
    clearHighlight(iframeRef.current?.contentDocument);
  }, [iframeRef]);

  useEffect(() => { initDictionary(); }, []);

  const onHotkeyDown = useCallback(e => {
    if (e.code !== hotkey) return;
    setEnabled(true);
    triggerRef.current?.();                          // don't wait for the next mousemove to react
  }, [hotkey]);
  const onHotkeyUp = useCallback(e => {
    if (e.code === hotkey) setEnabled(false);
  }, [hotkey]);

  useEffect(() => {                  // also listens on the outer window: keydown only reaches the
    const onBlur = () => setEnabled(false);           // iframe's own document once it has focus
    window.addEventListener("keydown", onHotkeyDown);
    window.addEventListener("keyup", onHotkeyUp);
    window.addEventListener("blur", onBlur);          // e.g. alt-tabbing away shouldn't leave it stuck on
    return () => {
      window.removeEventListener("keydown", onHotkeyDown);
      window.removeEventListener("keyup", onHotkeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [onHotkeyDown, onHotkeyUp]);

  useEffect(() => {                                 // clicks outside the iframe, and scrolling, close the popup
    const onDown = e => { if (!e.target.closest?.("[data-jp-popup]")) close(); };
    const onScroll = () => { clearTimeout(timerRef.current); setPopup(null); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);   // capture: catches #viewer-clip scrolling
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      cleanupRef.current?.();
    };
  }, [close]);

  const attach = useCallback(iframe => {
    cleanupRef.current?.();
    const doc = iframe?.contentDocument;
    if (!doc) return;
    let last = null, span = null, raf = 0, pt = { x: 0, y: 0 };   // span = pieces i..j of the word currently shown

    const lookupToken = async t => {
      const pieces = t.segs.map(p => ({ t: p.segment, w: p.isWordLike }));
      const res = await lookupAround(pieces, t.k, t.c);
      if (last !== t) return;                                      // pointer moved on while the lookup ran
      span = { block: t.block, i: res.i, j: res.j };
      const merged = res.i !== t.k || res.j !== t.k ? t.rangeFor(res.i, res.j) : null;
      if (merged) highlight(doc, merged);                          // highlight the whole matched word, e.g. 食べました
      const f = iframe.getBoundingClientRect(), r = (merged || t.range).getBoundingClientRect();
      setPopup({ info: res.info, text: res.text, rect: { left: f.left + r.left, top: f.top + r.top, bottom: f.top + r.bottom } });  // iframe -> page coords
    };

    const onMove = e => {
      pt = { x: e.clientX, y: e.clientY };
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const t = tokenAt(doc, pt.x, pt.y);
        if (t && span && t.block === span.block && t.k >= span.i && t.k <= span.j) { last = t; return; }   // still inside the word that is shown
        if ((t && last && t.block === last.block && t.idx === last.idx) || (!t && !last)) return;
        last = t; span = null; clearTimeout(timerRef.current);
        if (!t || !enabledRef.current) return;   // no hotkey held: track the word, but don't show anything
        highlight(doc, t.range);
        timerRef.current = setTimeout(() => lookupToken(t), dwellMs);
      });
    };
    const onDown = () => { last = null; span = null; close(); };    // click inside the book also closes the popup

    doc.addEventListener("mousemove", onMove);
    doc.addEventListener("mousedown", onDown);
    doc.addEventListener("keydown", onHotkeyDown);
    doc.addEventListener("keyup", onHotkeyUp);
    triggerRef.current = () => {
      if (!last) return;
      highlight(doc, last.range);
      clearTimeout(timerRef.current);
      lookupToken(last);
    };
    cleanupRef.current = () => {
      doc.removeEventListener("mousemove", onMove);
      doc.removeEventListener("mousedown", onDown);
      doc.removeEventListener("keydown", onHotkeyDown);
      doc.removeEventListener("keyup", onHotkeyUp);
      cancelAnimationFrame(raf); clearTimeout(timerRef.current);
      triggerRef.current = null;
    };
  }, [close, dwellMs, onHotkeyDown, onHotkeyUp]);

  return { popup, attach, close };
}
