/**
 * Builds a small text-layer PDF in the layout the extraction pipeline reads (backend pdf_extraction/layout.py):
 * a hanging question number ("1."), the stem, options "(1)" to "(4)", a dated source in brackets, and an answer-key
 * table at the end ("1. (2)  2. (3) …"). Standard Helvetica, English text, so the test needs no fonts.
 */
export type TestQuestion = { stem: string; options: [string, string, string, string]; source: string; answer: 1 | 2 | 3 | 4 };

const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

export function makePdf(questions: TestQuestion[]): Buffer {
  const lines: { x: number; y: number; size: number; text: string }[] = [];
  let y = 780;
  questions.forEach((q, i) => {
    lines.push({ x: 50, y, size: 11, text: `${i + 1}.` });
    lines.push({ x: 76, y, size: 11, text: q.stem });
    y -= 16;
    lines.push({ x: 76, y, size: 11, text: `(1) ${q.options[0]}   (2) ${q.options[1]}   (3) ${q.options[2]}   (4) ${q.options[3]}` });
    y -= 16;
    lines.push({ x: 76, y, size: 10, text: `(${q.source})` });
    y -= 34;
  });
  const content1 = lines.map((l) => `BT /F1 ${l.size} Tf ${l.x} ${l.y} Td (${esc(l.text)}) Tj ET`).join("\n");
  const key = questions.map((q, i) => `${i + 1}. (${q.answer})`);
  const keyLines = [{ x: 50, y: 780, size: 11, text: "Answer Key" }, { x: 50, y: 760, size: 11, text: key.join("   ") }];
  const content2 = keyLines.map((l) => `BT /F1 ${l.size} Tf ${l.x} ${l.y} Td (${esc(l.text)}) Tj ET`).join("\n");

  const objs: string[] = [];
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push("<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>");
  objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>");
  objs.push(`<< /Length ${Buffer.byteLength(content1)} >>\nstream\n${content1}\nendstream`);
  objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>");
  objs.push(`<< /Length ${Buffer.byteLength(content2)} >>\nstream\n${content2}\nendstream`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// The importer matches questions by their text, so each run needs its own wording or it would match an earlier run's questions.
export const sampleQuestions = (tag: string): TestQuestion[] => [
  ...BASE.map((q) => ({ ...q, stem: q.stem.replace("?", ` (${tag})?`) })),
];

const BASE: TestQuestion[] = [
  { stem: "Which city is the capital of India?", options: ["Mumbai", "New Delhi", "Kolkata", "Chennai"], source: "SSC CGL 12.09.2022", answer: 2 },
  { stem: "Which river is the longest in India?", options: ["Yamuna", "Godavari", "Ganga", "Narmada"], source: "SSC CGL 12.09.2022", answer: 3 },
  { stem: "How many days are there in a leap year?", options: ["366", "365", "364", "360"], source: "SSC CGL 12.09.2022", answer: 1 },
];
