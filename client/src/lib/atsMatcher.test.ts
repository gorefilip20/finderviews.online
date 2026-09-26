import { describe, expect, it } from "vitest";
import { matchResumeToJob } from "./atsMatcher";

describe("ATS keyword matcher", () => {
  it("scores matching resume terms and reports missing terms", () => {
    const result = matchResumeToJob("React TypeScript accessibility", "React TypeScript SQL accessibility");
    expect(result.score).toBe(75);
    expect(result.matched).toEqual(expect.arrayContaining(["react", "typescript", "accessibility"]));
    expect(result.missing).toContain("sql");
  });
});
