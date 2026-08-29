import { describe, expect, it } from "vitest";
import { assertPublicUrl, buildChecks, normalizeUrl, scoreChecks, type AuditCheck } from "./webaudit";

const check = (status: AuditCheck["status"], weight = 10): AuditCheck => ({
  key: `k-${Math.random()}`,
  label: "check",
  status,
  weight,
  detail: "detail",
});

describe("normalizeUrl", () => {
  it("assumes https when no scheme is supplied", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
  });

  it("rejects an empty address", () => {
    expect(() => normalizeUrl("   ")).toThrow(/required/i);
  });
});

describe("assertPublicUrl", () => {
  it("rejects loopback and private hosts so the audit cannot be used to probe the network", async () => {
    await expect(assertPublicUrl("http://localhost:3000")).rejects.toThrow(/not publicly routable/i);
    await expect(assertPublicUrl("http://127.0.0.1")).rejects.toThrow(/private network/i);
    await expect(assertPublicUrl("http://10.0.0.5")).rejects.toThrow(/private network/i);
    await expect(assertPublicUrl("http://192.168.1.1")).rejects.toThrow(/private network/i);
    await expect(assertPublicUrl("http://169.254.169.254")).rejects.toThrow(/private network/i);
    await expect(assertPublicUrl("http://[::1]")).rejects.toThrow(/private network/i);
  });

  it("rejects non-http schemes and embedded credentials", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(/http and https/i);
    await expect(assertPublicUrl("https://user:pass@example.com")).rejects.toThrow(/credentials/i);
  });
});

describe("scoreChecks", () => {
  it("returns 0 when every check passes and 100 when every check fails", () => {
    expect(scoreChecks([check("pass"), check("pass")])).toBe(0);
    expect(scoreChecks([check("fail"), check("fail")])).toBe(100);
  });

  it("weights a failing heavy check above a failing light one", () => {
    const heavy = scoreChecks([check("fail", 30), check("pass", 10)]);
    const light = scoreChecks([check("pass", 30), check("fail", 10)]);
    expect(heavy).toBeGreaterThan(light);
  });

  it("treats a warning as a partial penalty and an unknown as a smaller one", () => {
    expect(scoreChecks([check("warn")])).toBe(50);
    expect(scoreChecks([check("unknown")])).toBe(35);
  });

  it("handles an empty check list without dividing by zero", () => {
    expect(scoreChecks([])).toBe(0);
  });
});

describe("buildChecks", () => {
  const url = new URL("https://example.com/");
  const run = (html: string, headers: Record<string, string> = {}, ms = 300) =>
    buildChecks(html, new Response("", { headers }), ms, url);

  const find = (checks: AuditCheck[], key: string) => checks.find(check => check.key === key)!;

  it("reads a modern, maintained page as healthy", () => {
    const html = `<!doctype html><html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>Cedar &amp; Loom Goods</title>
      <meta name="description" content="Handmade home goods in Austin." />
      <script src="https://www.googletagmanager.com/gtag/js"></script>
      </head><body><h1>Cedar &amp; Loom</h1>
      <a href="tel:+15125550138">Call</a>
      <a href="https://instagram.com/cedarloom">Instagram</a>
      <footer>© ${new Date().getFullYear()} Cedar &amp; Loom</footer>
      <div style="display:grid"></div></body></html>`;

    const checks = run(html);
    expect(find(checks, "viewport").status).toBe("pass");
    expect(find(checks, "title").status).toBe("pass");
    expect(find(checks, "analytics").status).toBe("pass");
    expect(find(checks, "contact").status).toBe("pass");
    expect(find(checks, "social").status).toBe("pass");
    expect(find(checks, "copyright").status).toBe("pass");
    expect(scoreChecks(checks)).toBeLessThan(30);
  });

  it("detects the decay signals that make a rebuild sellable", () => {
    const html = `<html><head><title>Home</title></head><body>
      <embed src="intro.swf" type="application/x-shockwave-flash" />
      <footer>Copyright 2011 Old Co</footer></body></html>`;

    const checks = run(html, {}, 4000);
    expect(find(checks, "viewport").status).toBe("fail");
    expect(find(checks, "legacy").status).toBe("fail");
    expect(find(checks, "legacy").detail).toMatch(/flash/i);
    expect(find(checks, "copyright").status).toBe("fail");
    expect(find(checks, "copyright").detail).toMatch(/2011/);
    expect(find(checks, "speed").status).toBe("fail");
    expect(find(checks, "analytics").status).toBe("warn");
    expect(scoreChecks(checks)).toBeGreaterThan(55);
  });

  it("recognises a parked or placeholder page", () => {
    const checks = run("<html><body><h1>Coming soon</h1></body></html>");
    expect(find(checks, "parked").status).toBe("fail");
    expect(find(checks, "parked").detail).toMatch(/parked, default, or under construction/i);
  });

  it("reports an unreadable copyright year as unknown rather than guessing", () => {
    const checks = run("<html><body><p>No dates here.</p></body></html>");
    expect(find(checks, "copyright").status).toBe("unknown");
    expect(find(checks, "copyright").detail).toMatch(/no copyright year/i);
  });

  it("uses the Last-Modified header when the server supplies one", () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 4).toUTCString();
    const checks = run("<html><body>x</body></html>", { "last-modified": old });
    expect(find(checks, "lastModified").status).toBe("fail");
    expect(find(checks, "lastModified").detail).toMatch(/month\(s\) ago/);
  });

  it("flags a plain-http page as insecure", () => {
    const insecure = buildChecks("<html></html>", new Response(""), 100, new URL("http://example.com/"));
    expect(insecure.find(check => check.key === "https")!.status).toBe("fail");
  });
});
