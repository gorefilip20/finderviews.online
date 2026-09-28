import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export const RESUME_MAX_BYTES = 8 * 1024 * 1024;
export const RESUME_MAX_CHARS = 50_000;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type ResumeFileKind = "pdf" | "docx" | "txt";

export function detectResumeKind(fileName: string, mimeType = ""): ResumeFileKind | null {
  const name = fileName.toLowerCase();
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mimeType === DOCX_MIME || name.endsWith(".docx")) return "docx";
  if (mimeType.startsWith("text/") || /\.(txt|md|rtf|html?)$/.test(name)) return "txt";
  return null;
}

function cleanText(value: string) {
  return value.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, RESUME_MAX_CHARS);
}

export async function extractResumeText(buffer: Buffer, fileName: string, mimeType = "") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error("The uploaded resume is empty.");
  if (buffer.length > RESUME_MAX_BYTES) throw new Error("Resume files must be 8 MB or smaller.");
  const kind = detectResumeKind(fileName, mimeType);
  if (!kind) throw new Error("Upload a PDF, DOCX, TXT, Markdown, RTF, or HTML resume.");

  let text = "";
  if (kind === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
  } else if (kind === "docx") {
    text = (await mammoth.extractRawText({ buffer })).value;
  } else {
    text = buffer.toString("utf8");
  }
  const cleaned = cleanText(text);
  if (cleaned.length < 20) throw new Error("We could not extract enough readable text from that resume. Try an OCR-enabled PDF or paste the text instead.");
  return { text: cleaned, kind, characters: cleaned.length };
}
