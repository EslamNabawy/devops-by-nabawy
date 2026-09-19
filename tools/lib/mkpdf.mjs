// mkpdf.mjs — synthetic PDF fixtures for Gate 3b (pdf-lib backend).
// Valid PDFs, Helvetica text, configurable page count + Info title/author.
// Usage: node tools/lib/mkpdf.mjs <out.pdf> <pages> [title] [author]
import { promises as fs } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

export async function mkpdf(out, pages, lines, title, author) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([612, 792]);
    let text = lines[p] !== undefined ? lines[p]
      : `Fixture page ${p + 1} of ${pages}.`;
    // Pad: pdfjs v1.10 misparses tiny content streams; keep pages ≥300ch.
    while (text.length < 300) text += " Padding to reach minimum size.";
    page.drawText(text.slice(0, 2000), { x: 72, y: 720, size: 12,
      font, maxWidth: 468 });
  }
  if (title) doc.setTitle(title);
  if (author) doc.setAuthor(author);
  // useObjectStreams:false — pdf-parse's pdfjs (v1.10) cannot read
  // compressed object containers.
  const bytes = await doc.save({ useObjectStreams: false });
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, bytes);
}

const [out, pages, title, author] = process.argv.slice(2);
if (out) {
  const n = Number(pages || 1);
  const lines = Array.from({ length: n }, (_, i) => `page${i + 1}`);
  await mkpdf(out, n, lines, title || "", author || "");
  console.log(`wrote ${out} (${n}p)`);
}
