import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { detectResumeKind, extractResumeText, RESUME_MAX_BYTES } from "./resumeParser";

describe("resume parser", () => {
  it("detects supported resume formats", () => {
    expect(detectResumeKind("candidate.pdf", "application/pdf")).toBe("pdf");
    expect(detectResumeKind("candidate.docx")).toBe("docx");
    expect(detectResumeKind("candidate.txt", "text/plain")).toBe("txt");
    expect(detectResumeKind("candidate.exe", "application/octet-stream")).toBeNull();
  });

  it("extracts and normalizes a text resume without persistence", async () => {
    const result = await extractResumeText(Buffer.from("Alex Candidate\n\nSoftware engineer with React and TypeScript experience."), "candidate.txt", "text/plain");
    expect(result.kind).toBe("txt");
    expect(result.text).toContain("React and TypeScript");
    expect(result.characters).toBe(result.text.length);
  });

  it("extracts readable text from a DOCX resume", async () => {
    const result = await extractResumeText(await readFile(new URL("./fixtures/sample-resume.docx", import.meta.url)), "candidate.docx");
    expect(result.kind).toBe("docx");
    expect(result.text).toContain("React and TypeScript");
  });

  it("rejects oversized uploads before parsing", async () => {
    await expect(extractResumeText(Buffer.alloc(RESUME_MAX_BYTES + 1), "candidate.txt", "text/plain")).rejects.toThrow("8 MB");
  });

  it("rejects unsupported file types", async () => {
    await expect(extractResumeText(Buffer.from("not a resume"), "candidate.exe", "application/octet-stream")).rejects.toThrow("PDF, DOCX");
  });
});
