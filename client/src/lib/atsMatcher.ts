const STOP_WORDS = new Set("a an and are as at be by for from in into is it of on or the their this to with you your will we our".split(" "));

export function extractKeywords(text: string) {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || []) {
    const keyword = raw.replace(/[.-]+$/, "");
    if (STOP_WORDS.has(keyword) || keyword.length < 3) continue;
    counts.set(keyword, (counts.get(keyword) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([keyword]) => keyword).slice(0, 30);
}

export function matchResumeToJob(resume: string, requirements: string, description = "") {
  const resumeText = resume.toLowerCase();
  const keywords = extractKeywords(`${requirements} ${description}`);
  const matched = keywords.filter((keyword) => resumeText.includes(keyword));
  const missing = keywords.filter((keyword) => !resumeText.includes(keyword));
  const score = keywords.length ? Math.round((matched.length / keywords.length) * 100) : 0;
  return { score, matched, missing };
}
