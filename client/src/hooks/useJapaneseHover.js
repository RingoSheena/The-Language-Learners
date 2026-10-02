// src/hooks/useJapaneseHover.js
// Hover-to-define for book text rendered inside an <iframe> (like Reader.jsx's srcDoc iframe).
import { useCallback, useEffect, useRef, useState } from "react";
import { initDictionary, lookupWord } from "../lib/dictionary";

const seg = new Intl.Segmenter("ja", { granularity: "word" });   // tokenization
const BLOCK = "p,div,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt";
const SKIP = "rt,rp";                                            // furigana is never part of the word text

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

  for (const s of seg.segment(text)) {
    if (s.index > g) break;
    if (!s.isWordLike || g > s.index + s.segment.length) continue;
    const a = pos(nodes, s.index, false), b = pos(nodes, s.index + s.segment.length, true);
    if (!a || !b) continue;
    const range = doc.createRange();
    range.setStart(a[0], a[1]); range.setEnd(b[0], b[1]);
    for (const r of range.getClientRects())                       // pointer must really be over this word
      if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2)
        return { range, text: s.segment, block, idx: s.index };
  }
  return null;
}

const highlight = (doc, range) => {
  const w = doc.defaultView;
  if (w.CSS?.highlights) w.CSS.highlights.set("jp-token", new w.Highlight(range));   // needs ::highlight(jp-token) CSS inside the iframe
  else { const s = doc.getSelection(); s.removeAllRanges(); s.addRange(range); }
};
const clearHighlight = doc => { try { doc?.defaultView?.CSS?.highlights?.delete("jp-token"); } catch {} };

/** Persisted on/off switch for the definition popup */
export function useHoverToggle() {
  const [on, setOn] = useState(() => { try { return localStorage.getItem("jpDefOn") !== "0"; } catch { return true; } });
  const set = v => { setOn(v); try { localStorage.setItem("jpDefOn", v ? "1" : "0"); } catch {} };
  return [on, set];
}

/**
 * const { popup, attach } = useJapaneseHover(iframeRef, { enabled })
 * Call attach(iframe) every time the iframe finishes loading.
 */
export function useJapaneseHover(iframeRef, { enabled = true, dwellMs = 250 } = {}) {
  const [popup, setPopup] = useState(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const timerRef = useRef(null);
  const cleanupRef = useRef(null);

  const close = useCallback(() => {
    clearTimeout(timerRef.current);
    setPopup(null);
    clearHighlight(iframeRef.current?.contentDocument);
  }, [iframeRef]);

  useEffect(() => { initDictionary(); }, []);
  useEffect(() => { if (!enabled) close(); }, [enabled, close]);

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
    let last = null, raf = 0, pt = { x: 0, y: 0 };

    const onMove = e => {
      pt = { x: e.clientX, y: e.clientY };
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const t = tokenAt(doc, pt.x, pt.y);
        if ((t && last && t.block === last.block && t.idx === last.idx) || (!t && !last)) return;
        last = t; clearTimeout(timerRef.current);
        if (!t) { clearHighlight(doc); return; }
        highlight(doc, t.range);
        if (enabledRef.current) timerRef.current = setTimeout(async () => {
          const info = await lookupWord(t.text);
          const f = iframe.getBoundingClientRect(), r = t.range.getBoundingClientRect();
          setPopup({ info, text: t.text, rect: { left: f.left + r.left, bottom: f.top + r.bottom } });  // iframe -> page coords
        }, dwellMs);
      });
    };
    const onDown = () => { last = null; close(); };    // click inside the book also closes the popup

    doc.addEventListener("mousemove", onMove);
    doc.addEventListener("mousedown", onDown);
    cleanupRef.current = () => {
      doc.removeEventListener("mousemove", onMove);
      doc.removeEventListener("mousedown", onDown);
      cancelAnimationFrame(raf); clearTimeout(timerRef.current);
    };
  }, [close, dwellMs]);

  return { popup, attach, close };
}
