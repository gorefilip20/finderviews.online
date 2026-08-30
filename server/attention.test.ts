import { describe, expect, it } from "vitest";
import { durationFrom, findBookingLinks, intentFrom, providerFor } from "./booking";
import {
  analyseAttentionPage,
  audienceSignals,
  detectChannelType,
  findOpenDoors,
  HUNTING_GROUNDS,
  pickBestBooking,
  scoreBorrowability,
} from "./attention";

/* ------------------------------------------------------------------ booking */

describe("providerFor", () => {
  it("recognises the major scheduling tools", () => {
    expect(providerFor("calendly.com")).toBe("Calendly");
    expect(providerFor("cal.com")).toBe("Cal.com");
    expect(providerFor("meetings.hubspot.com")).toBe("HubSpot Meetings");
    expect(providerFor("app.squarespacescheduling.com")).toBe("Acuity");
    expect(providerFor("www.savvycal.com")).toBe("SavvyCal");
  });

  it("does not mistake an unrelated host for a scheduler", () => {
    expect(providerFor("example.com")).toBeNull();
    expect(providerFor("notcalendly.com.evil.test")).toBeNull();
  });
});

describe("durationFrom and intentFrom", () => {
  it("reads a slot length out of the slug or the label", () => {
    expect(durationFrom("https://calendly.com/alex/30min", "")).toBe(30);
    expect(durationFrom("https://cal.com/sam/x", "Book a 15 minute chat")).toBe(15);
    expect(durationFrom("https://calendly.com/alex/coffee", "Book a chat")).toBeNull();
  });

  it("classifies what the link is for", () => {
    expect(intentFrom("https://calendly.com/a/demo", "Book a demo")).toBe("sales");
    expect(intentFrom("https://calendly.com/a/office-hours", "Office hours")).toBe("office-hours");
    expect(intentFrom("https://calendly.com/a/podcast-guest", "Be a guest")).toBe("interview");
    expect(intentFrom("https://calendly.com/a/intro", "Intro chat")).toBe("intro");
    expect(intentFrom("https://calendly.com/a/audit", "Strategy session")).toBe("consultation");
  });
});

describe("findBookingLinks", () => {
  it("finds a scheduling link in an anchor", () => {
    const links = findBookingLinks(
      `<a href="https://calendly.com/amara/15min">Book a 15 minute intro</a>`,
      "https://amara.example/",
    );
    expect(links).toHaveLength(1);
    expect(links[0].provider).toBe("Calendly");
    expect(links[0].minutes).toBe(15);
    expect(links[0].intent).toBe("intro");
  });

  it("finds an embedded widget destination", () => {
    const links = findBookingLinks(
      `<div class="calendly-inline-widget" data-url="https://calendly.com/team/demo"></div>`,
      "https://x.example/",
    );
    expect(links[0]?.provider).toBe("Calendly");
  });

  it("ignores a bare provider homepage, which belongs to nobody", () => {
    expect(findBookingLinks(`<a href="https://calendly.com/">Calendly</a>`, "https://x.example/")).toHaveLength(0);
  });

  it("de-duplicates the same link appearing twice", () => {
    const html = `<a href="https://cal.com/sam/intro">Book</a><a href="https://cal.com/sam/intro">Book now</a>`;
    expect(findBookingLinks(html, "https://sam.example/")).toHaveLength(1);
  });

  it("returns nothing when no scheduler is published", () => {
    expect(findBookingLinks(`<a href="/contact">Contact us</a>`, "https://x.example/")).toHaveLength(0);
  });
});

describe("pickBestBooking", () => {
  it("prefers a short introductory slot over a long sales call", () => {
    const best = pickBestBooking([
      { provider: "Calendly", url: "https://calendly.com/a/demo", label: "Demo", intent: "sales", minutes: 60 },
      { provider: "Calendly", url: "https://calendly.com/a/intro", label: "Intro", intent: "intro", minutes: 15 },
    ]);
    expect(best.intent).toBe("intro");
  });
});

/* -------------------------------------------------------------------- doors */

describe("findOpenDoors", () => {
  it("puts a booking link first, because it is the strongest invitation", () => {
    const html = `<a href="https://calendly.com/host/20min">Book time</a><a href="/be-a-guest">Be a guest</a>`;
    const doors = findOpenDoors(html, "https://show.example/");
    expect(doors[0].key).toBe("book_a_call");
    expect(doors.map(door => door.key)).toContain("be_a_guest");
  });

  it("detects each door from either a link or the page copy", () => {
    expect(findOpenDoors(`<a href="/sponsor">Sponsor us</a>`, "https://x.example/")[0].key).toBe("sponsor");
    expect(findOpenDoors(`<p>Call for speakers is now open.</p>`, "https://x.example/")[0].key).toBe("speak");
    expect(findOpenDoors(`<a href="/write-for-us">Write for us</a>`, "https://x.example/")[0].key).toBe("write");
    expect(findOpenDoors(`<a href="/join">Join our community</a>`, "https://x.example/")[0].key).toBe("join_community");
  });

  it("resolves a relative door link against the site", () => {
    const doors = findOpenDoors(`<a href="/be-a-guest">Apply to be a guest</a>`, "https://show.example/page");
    expect(doors[0].url).toBe("https://show.example/be-a-guest");
  });

  it("carries evidence and a concrete approach for every door", () => {
    const doors = findOpenDoors(`<a href="/sponsor">Advertise with us</a>`, "https://x.example/");
    expect(doors[0].evidence.length).toBeGreaterThan(0);
    expect(doors[0].approach.length).toBeGreaterThan(0);
    expect(doors[0].why.length).toBeGreaterThan(0);
  });

  it("reports no doors on a page that invites nothing", () => {
    expect(findOpenDoors(`<p>Welcome to our homepage.</p>`, "https://x.example/")).toHaveLength(0);
  });

  it("does not list the same door twice", () => {
    const html = `<a href="/sponsor">Sponsor</a><a href="/advertise">Advertise with us</a>`;
    const keys = findOpenDoors(html, "https://x.example/").map(door => door.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/* ----------------------------------------------------------------- channel */

describe("detectChannelType", () => {
  it("recognises a podcast", () => {
    const result = detectChannelType(
      `<p>Episode 42 · Listen on Apple Podcasts and Spotify. Subscribe on your podcast app.</p>`,
      "https://show.example",
    );
    expect(result.type).toBe("podcast");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("recognises a newsletter and a community", () => {
    expect(detectChannelType(`<p>A newsletter every Monday. Issue #31. Subscribe.</p>`, "https://x.example").type).toBe("newsletter");
    expect(detectChannelType(`<p>Join the community on Slack — 4,000 members in the forum.</p>`, "https://x.example").type).toBe("community");
  });

  it("returns unknown rather than guessing", () => {
    expect(detectChannelType(`<p>Lorem ipsum.</p>`, "https://x.example").type).toBe("unknown");
  });
});

/* ---------------------------------------------------------------- audience */

describe("audienceSignals", () => {
  it("reads a stated audience figure", () => {
    const result = audienceSignals(`<p>Read by 12,000 subscribers every week.</p>`);
    expect(result.estimate).toBe(12_000);
    expect(result.signals[0].kind).toBe("subscribers");
  });

  it("expands shorthand and takes the largest credible signal", () => {
    const result = audienceSignals(`<p>40K listeners</p><p>1,200 members</p>`);
    expect(result.estimate).toBe(40_000);
  });

  it("reads an episode count as a durability signal", () => {
    const result = audienceSignals(`<p>Episode 214 out now.</p>`);
    expect(result.signals.some(signal => signal.kind === "episodes")).toBe(true);
  });

  it("reports nothing rather than inventing a figure", () => {
    const result = audienceSignals(`<p>A show about design.</p>`);
    expect(result.estimate).toBeNull();
    expect(result.signals).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------- score */

describe("scoreBorrowability", () => {
  const door = { key: "book_a_call" as const, label: "Book", evidence: "", why: "", approach: "" };

  it("treats a published booking link as wide open", () => {
    const result = scoreBorrowability({ doors: [door], audienceEstimate: 3000, topicOverlap: 1, channelConfidence: 60, hasContact: false });
    expect(result.band).toBe("open");
    expect(result.headline).toMatch(/book time with them today/i);
  });

  it("ranks a small reachable audience above a large unreachable one", () => {
    const reachable = scoreBorrowability({ doors: [door], audienceEstimate: 3_000, topicOverlap: 2, channelConfidence: 70, hasContact: true });
    const unreachable = scoreBorrowability({ doors: [], audienceEstimate: 300_000, topicOverlap: 2, channelConfidence: 70, hasContact: false });
    expect(reachable.score).toBeGreaterThan(unreachable.score);
    expect(unreachable.band).toBe("closed");
  });

  it("says plainly when there is no way in", () => {
    const result = scoreBorrowability({ doors: [], audienceEstimate: null, topicOverlap: 0, channelConfidence: 0, hasContact: false });
    expect(result.band).toBe("closed");
    expect(result.headline).toMatch(/no published way in/i);
  });

  it("excludes an unpublished audience figure from confidence rather than assuming zero", () => {
    const result = scoreBorrowability({ doors: [door], audienceEstimate: null, topicOverlap: 0, channelConfidence: 0, hasContact: false });
    const audienceFactor = result.factors.find(factor => factor.label === "Audience");
    expect(audienceFactor?.note).toMatch(/excluded from confidence/i);
  });

  it("always returns a score in range with weighted factors", () => {
    const result = scoreBorrowability({ doors: [door], audienceEstimate: 1000, topicOverlap: 1, channelConfidence: 50, hasContact: true });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.factors.reduce((sum, factor) => sum + factor.weight, 0)).toBe(100);
  });
});

/* ---------------------------------------------------------------- analysis */

describe("analyseAttentionPage", () => {
  const html = `<html><head><title>The Studio Show — Podcast</title></head><body>
    <p>Episode 88. Listen on Apple Podcasts. 18,000 listeners每 week.</p>
    <p>We cover design, branding and business.</p>
    <a href="/be-a-guest">Apply to be a guest</a>
    <a href="https://calendly.com/host/20min">Book 20 minutes with the host</a>
  </body></html>`;

  it("produces a complete, actionable read of a page", () => {
    const result = analyseAttentionPage({
      html,
      url: "studioshow.example",
      finalUrl: "https://studioshow.example/",
      myTopics: ["branding", "business"],
    });

    expect(result.channel.type).toBe("podcast");
    expect(result.name).toContain("The Studio Show");
    expect(result.doors[0].key).toBe("book_a_call");
    expect(result.bookingLinks[0].minutes).toBe(20);
    expect(result.score.band).toBe("open");
    expect(result.nextStep).toMatch(/book/i);
  });

  it("tells the user what to do when there is no door", () => {
    const result = analyseAttentionPage({
      html: "<html><body><p>A quiet homepage.</p></body></html>",
      url: "quiet.example",
      finalUrl: "https://quiet.example/",
    });
    expect(result.doors).toHaveLength(0);
    expect(result.nextStep).toMatch(/be useful in public|familiar name/i);
  });

  it("measures topic overlap against the caller's own subjects", () => {
    const withOverlap = analyseAttentionPage({ html, url: "x", finalUrl: "https://x.example/", myTopics: ["branding"] });
    const without = analyseAttentionPage({ html, url: "x", finalUrl: "https://x.example/", myTopics: ["gaming"] });
    expect(withOverlap.score.score).toBeGreaterThanOrEqual(without.score.score);
  });
});

describe("HUNTING_GROUNDS", () => {
  it("gives a concrete place to look and a tactic for each channel", () => {
    expect(HUNTING_GROUNDS.length).toBeGreaterThan(3);
    for (const ground of HUNTING_GROUNDS) {
      expect(ground.where.length).toBeGreaterThan(10);
      expect(ground.tip.length).toBeGreaterThan(10);
    }
  });
});
