import { describe, expect, it } from "vitest";
import {
  classifyEmail,
  discoverContacts,
  extractEmails,
  extractJsonLd,
  extractPhones,
  findContactLink,
  formatPostalAddress,
  segmentRank,
  SEGMENT_KEYS,
  SEGMENTS,
} from "./contacts";

describe("extractEmails", () => {
  it("reads addresses from mailto links and from page text", () => {
    const html = `<a href="mailto:hello@studio.com">Email us</a><p>or sales@studio.com</p>`;
    expect(extractEmails(html).sort()).toEqual(["hello@studio.com", "sales@studio.com"]);
  });

  it("decodes a mailto link and drops its subject parameters", () => {
    const html = `<a href="mailto:hello%40studio.com?subject=Hi%20there">Email</a>`;
    expect(extractEmails(html)).toContain("hello@studio.com");
  });

  it("understands the [at] / [dot] obfuscation small sites use", () => {
    expect(extractEmails("<p>hello [at] studio [dot] com</p>")).toContain("hello@studio.com");
    expect(extractEmails("<p>info (at) studio (dot) co (dot) uk</p>")).toContain("info@studio.co.uk");
  });

  it("ignores addresses belonging to the site platform rather than the business", () => {
    const html = `<p>hello@studio.com</p><script>support@wix.com</script><p>abc@sentry.io</p>`;
    const found = extractEmails(html);
    expect(found).toContain("hello@studio.com");
    expect(found).not.toContain("support@wix.com");
    expect(found).not.toContain("abc@sentry.io");
  });

  it("does not mistake asset filenames for addresses", () => {
    expect(extractEmails(`<img src="sprite@2x.png">`)).toHaveLength(0);
  });

  it("de-duplicates and normalises casing", () => {
    const html = `<a href="mailto:Hello@Studio.com">a</a><p>HELLO@STUDIO.COM</p>`;
    expect(extractEmails(html)).toEqual(["hello@studio.com"]);
  });

  it("returns nothing for a page that publishes nothing", () => {
    expect(extractEmails("<html><body><h1>Welcome</h1></body></html>")).toHaveLength(0);
  });
});

describe("classifyEmail", () => {
  it("recognises a shared business inbox", () => {
    for (const address of ["info@studio.com", "hello@studio.com", "new.business@studio.com"]) {
      expect(classifyEmail(address, "studio.com").kind).toBe("role");
    }
  });

  it("flags a name-shaped address as an individual and says why it still matters", () => {
    const result = classifyEmail("leslie@bourkedesign.com", "bourkedesign.com");
    expect(result.kind).toBe("individual");
    expect(result.note).toMatch(/still personal data/i);
  });

  it("marks whether the address is on the organisation's own domain", () => {
    expect(classifyEmail("hello@studio.com", "studio.com").ownDomain).toBe(true);
    expect(classifyEmail("studio@gmail.com", "studio.com").ownDomain).toBe(false);
    expect(classifyEmail("hello@mail.studio.com", "studio.com").ownDomain).toBe(true);
  });

  it("notes a free mailbox without treating it as invalid", () => {
    const result = classifyEmail("mystudio@gmail.com", "mystudio.com");
    expect(result.freeProvider).toBe(true);
    expect(result.address).toBe("mystudio@gmail.com");
  });
});

describe("segmentRank", () => {
  it("puts the segment's own inbox above a generic one", () => {
    expect(segmentRank("bookings@model.com", "creator")).toBeGreaterThan(segmentRank("info@model.com", "creator"));
    expect(segmentRank("deals@fund.com", "investor")).toBeGreaterThan(segmentRank("info@fund.com", "investor"));
    expect(segmentRank("info@shop.com", "business")).toBeGreaterThan(segmentRank("random@shop.com", "business"));
  });

  it("scores an unrelated address at zero", () => {
    expect(segmentRank("webmaster@x.com", "creator")).toBe(0);
  });

  it("defines a label, ranking preferences and a sourcing note for every segment", () => {
    for (const key of SEGMENT_KEYS) {
      expect(SEGMENTS[key].label.length).toBeGreaterThan(0);
      expect(SEGMENTS[key].preferred.length).toBeGreaterThan(0);
      expect(SEGMENTS[key].note.length).toBeGreaterThan(0);
    }
  });

  it("states in the creator segment that nothing is read from a social platform", () => {
    expect(SEGMENTS.creator.note).toMatch(/does not read it from a social platform/i);
  });
});

describe("extractJsonLd", () => {
  it("reads an organisation block", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Organization",
      name: "Cedar & Loom",
      email: "mailto:hello@cedar.com",
      telephone: "+1 512 555 0138",
      address: { streetAddress: "1 South Congress", addressLocality: "Austin", addressCountry: "US" },
    })}</script>`;

    const result = extractJsonLd(html);
    expect(result.name).toBe("Cedar & Loom");
    expect(result.email).toBe("hello@cedar.com");
    expect(result.telephone).toBe("+1 512 555 0138");
    expect(formatPostalAddress(result.address)).toBe("1 South Congress, Austin, US");
  });

  it("walks @graph and contactPoint structures", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@graph": [{ "@type": "WebSite" }, { "@type": "Organization", contactPoint: { email: "sales@cedar.com" } }],
    })}</script>`;
    expect(extractJsonLd(html).email).toBe("sales@cedar.com");
  });

  it("survives malformed structured data instead of failing the lookup", () => {
    const html = `<script type="application/ld+json">{ not valid json </script>`;
    expect(extractJsonLd(html)).toEqual({});
  });

  it("returns an empty object when the page has no structured data", () => {
    expect(extractJsonLd("<html></html>")).toEqual({});
  });
});

describe("formatPostalAddress", () => {
  it("accepts a plain string", () => {
    expect(formatPostalAddress("1 High Street, Lagos")).toBe("1 High Street, Lagos");
  });

  it("returns undefined for empty or unusable input", () => {
    expect(formatPostalAddress(undefined)).toBeUndefined();
    expect(formatPostalAddress({})).toBeUndefined();
    expect(formatPostalAddress("   ")).toBeUndefined();
  });
});

describe("extractPhones", () => {
  it("reads tel links and ignores fragments too short to be numbers", () => {
    const html = `<a href="tel:+2348012345678">Call</a><a href="tel:12">x</a>`;
    expect(extractPhones(html)).toEqual(["+2348012345678"]);
  });
});

describe("findContactLink", () => {
  it("follows the site's own contact link", () => {
    const html = `<a href="/contact-us">Get in touch</a>`;
    expect(findContactLink(html, "https://studio.com/")).toBe("https://studio.com/contact-us");
  });

  it("recognises a German legal-notice link", () => {
    const html = `<a href="/impressum">Impressum</a>`;
    expect(findContactLink(html, "https://studio.de/")).toBe("https://studio.de/impressum");
  });

  it("never follows a link off the organisation's own site", () => {
    const html = `<a href="https://facebook.com/contact">Contact us on Facebook</a>`;
    expect(findContactLink(html, "https://studio.com/")).toBeNull();
  });

  it("returns null when there is no contact link", () => {
    expect(findContactLink(`<a href="/pricing">Pricing</a>`, "https://studio.com/")).toBeNull();
  });
});

describe("discoverContacts", () => {
  it("refuses a private or non-routable address, so it cannot probe an internal network", async () => {
    await expect(discoverContacts({ website: "http://127.0.0.1" })).rejects.toThrow(/private network/i);
    await expect(discoverContacts({ website: "http://localhost" })).rejects.toThrow(/not publicly routable/i);
    await expect(discoverContacts({ website: "file:///etc/passwd" })).rejects.toThrow(/http and https/i);
  });

  it("rejects an address carrying credentials", async () => {
    await expect(discoverContacts({ website: "https://user:pw@example.com" })).rejects.toThrow(/credentials/i);
  });
});
