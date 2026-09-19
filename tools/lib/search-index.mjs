// search-index: Tier 1 (startup) + Tier 2 per-track bodies (lazy).
// PDF chunks are per page with page:N for deep links.
export function tier1Entry(work) {
  return {
    id: work.id, ref: work.id, track: work.track, kind: work.kind,
    title: work.title, summary: work.summary || "", tags: work.tags || [],
    heading: null, format: work.formats.map((f) => f.type),
  };
}

export function headingEntries(work) {
  return (work.headings || []).slice(0, 60).map((h) => ({
    id: work.id, ref: `${work.id}#${h.id}`, track: work.track,
    kind: work.kind, title: work.title, summary: "", tags: [],
    heading: h.text, anchor: h.id, format: ["md"],
  }));
}

export function chunkText(text, max = 1200) {
  const clean = text.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ")
    .trim();
  const chunks = [];
  for (let i = 0; i < clean.length; i += max) {
    chunks.push(clean.slice(i, i + max));
    if (chunks.length >= 40) break;
  }
  return chunks;
}
