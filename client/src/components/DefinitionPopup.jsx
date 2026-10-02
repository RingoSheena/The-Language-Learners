// src/components/DefinitionPopup.jsx
const box = {
  position: "fixed", zIndex: 1000, maxWidth: 320, maxHeight: 340, overflow: "auto",
  background: "#fff", color: "#222", border: "1px solid #bbb", borderRadius: 8,
  boxShadow: "0 4px 16px rgba(0,0,0,.2)", padding: "12px 14px", fontFamily: "system-ui, sans-serif",
};

export default function DefinitionPopup({ popup }) {
  if (!popup) return null;
  const { info, text, rect } = popup;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 340));
  const top = rect.bottom + 8;

  let body;
  if (!info) {
    body = <><div style={{ fontSize: 24, fontWeight: 600 }}>{text}</div><div style={{ marginTop: 4 }}>Not found in the dictionary.</div></>;
  } else {
    const readings = [...new Set([...info.defs.map(d => d.r), ...info.freq.map(f => f.r)].filter(Boolean))];
    const best = info.freq.length ? info.freq.reduce((m, x) => (x.v < m.v ? x : m)) : null;
    body = (
      <>
        <div style={{ fontSize: 24, fontWeight: 600 }}>{info.word}</div>
        {info.surface !== info.word && <div style={{ fontSize: 12, color: "#888" }}>as written: {info.surface}</div>}
        <div style={{ color: "#666", margin: "2px 0 6px" }}>{readings.join("、 ") || "(no reading data)"}</div>
        {info.defs.length
          ? info.defs.slice(0, 4).map((d, i) => (
              <div key={i} style={{ fontSize: 15, lineHeight: 1.5, marginTop: 4 }}>
                {d.r && <b>{d.r} </b>}{d.gloss.join("; ").slice(0, 300)}
              </div>))
          : <div style={{ fontSize: 15 }}>Not in the built-in starter dictionary. Add jmdict-eng.json to public/dict/ for full coverage.</div>}
        {best && <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
          Frequency rank #{best.v}{best.disp.includes("❌") ? " (not in corpus)" : ""}{best.disp.includes("㋕") ? " (kana form)" : ""}
        </div>}
      </>
    );
  }
  return <div data-jp-popup style={{ ...box, left, top }}>{body}</div>;
}
