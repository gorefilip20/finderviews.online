import { describe, expect, it } from "vitest";
import {
  parseAudience,
  parseCount,
  parseFollowers,
  parseMediaKit,
  parseNiches,
  parsePartners,
  parseRates,
} from "./mediakit";
import {
  buildCollabBrief,
  defaultDeliverables,
  entryRate,
  matchCreators,
  scoreMatch,
  suggestStructure,
  type CreatorCandidate,
} from "./collab";

/* ---------------------------------------------------------------- media kit */

describe("parseCount", () => {
  it("expands the shorthand a media kit actually uses", () => {
    expect(parseCount("125K")).toBe(125_000);
    expect(parseCount("1.2M")).toBe(1_200_000);
    expect(parseCount("45,000")).toBe(45_000);
    expect(parseCount("2.4m")).toBe(2_400_000);
  });

  it("rejects values too small to be an audience, which are usually prices or percentages", () => {
    expect(parseCount("12")).toBeNull();
    expect(parseCount("65")).toBeNull();
  });

  it("rejects text that is not a count", () => {
    expect(parseCount("many")).toBeNull();
    expect(parseCount("")).toBeNull();
  });
});

describe("parseFollowers", () => {
  it("reads platform figures in either phrasing", () => {
    const followers = parseFollowers("<p>Instagram 125K · TikTok: 340K</p><p>1.2M on YouTube</p>");
    const byPlatform = Object.fromEntries(followers.map(f => [f.platform, f.followers]));
    expect(byPlatform.instagram).toBe(125_000);
    expect(byPlatform.tiktok).toBe(340_000);
    expect(byPlatform.youtube).toBe(1_200_000);
  });

  it("normalises X to twitter so one creator is not counted twice", () => {
    const followers = parseFollowers("<p>X 50K</p>");
    expect(followers[0].platform).toBe("twitter");
  });

  it("keeps the largest figure when a kit restates a rounded number", () => {
    const followers = parseFollowers("<p>Instagram 120K</p><p>Instagram 125,400</p>");
    expect(followers).toHaveLength(1);
    expect(followers[0].followers).toBe(125_400);
  });

  it("sorts by audience size", () => {
    const followers = parseFollowers("<p>Instagram 10K</p><p>TikTok 900K</p>");
    expect(followers[0].platform).toBe("tiktok");
  });

  it("returns nothing when no figures are published", () => {
    expect(parseFollowers("<p>Welcome to my site</p>")).toHaveLength(0);
  });
});

describe("parseRates", () => {
  it("reads a published rate card", () => {
    const rates = parseRates("<p>$500 per post</p><p>Reels — £1,200</p>");
    const amounts = rates.map(rate => rate.amount);
    expect(amounts).toContain(500);
    expect(amounts).toContain(1200);
    expect(rates.some(rate => rate.currency === "GBP")).toBe(true);
  });

  it("supports non-Western currencies", () => {
    const rates = parseRates("<p>Story package — ₦250,000</p>");
    expect(rates[0]?.currency).toBe("NGN");
    expect(rates[0]?.amount).toBe(250_000);
  });

  it("ignores prices that are not attached to a deliverable", () => {
    expect(parseRates("<p>Our office is at $5 Market Street</p>")).toHaveLength(0);
  });

  it("de-duplicates a rate quoted twice", () => {
    const rates = parseRates("<p>$500 per post</p><p>$500 per post</p>");
    expect(rates).toHaveLength(1);
  });
});

describe("parseAudience", () => {
  it("reads the demographics a kit states", () => {
    const facts = parseAudience("<p>68% female · 25-34 · 4.2% engagement</p>");
    const byKind = Object.fromEntries(facts.map(fact => [fact.kind, fact.value]));
    expect(byKind.gender).toBe("68% female");
    expect(byKind.age).toBe("25–34");
    expect(byKind.engagement).toBe("4.2%");
  });

  it("returns nothing rather than guessing when the kit is silent", () => {
    expect(parseAudience("<p>Hello</p>")).toHaveLength(0);
  });
});

describe("parsePartners and parseNiches", () => {
  it("reads brand names from a logo wall's alt text", () => {
    const partners = parsePartners(`<img class="brand-logo" alt="Nike logo" /><img class="brand-logo" alt="Glossier" />`);
    expect(partners).toContain("Nike");
    expect(partners).toContain("Glossier");
  });

  it("reads a worked-with sentence", () => {
    expect(parsePartners("<p>Worked with Adidas, Sephora and Lululemon.</p>")).toEqual(
      expect.arrayContaining(["Adidas", "Sephora"]),
    );
  });

  it("identifies published niches", () => {
    const niches = parseNiches("<p>Beauty and skincare content, plus travel.</p>");
    expect(niches).toEqual(expect.arrayContaining(["beauty", "skincare", "travel"]));
  });
});

describe("parseMediaKit", () => {
  it("assembles a full profile and totals the reach", () => {
    const profile = parseMediaKit(
      `<h1>Amara</h1><p>Instagram 125K · TikTok 75K</p><p>68% female</p><p>$800 per post</p><p>Beauty and skincare</p>`,
      "Amara",
    );
    expect(profile.totalReach).toBe(200_000);
    expect(profile.rates[0].amount).toBe(800);
    expect(profile.niches).toContain("beauty");
    expect(profile.sparse).toBe(false);
    expect(profile.summary).toMatch(/200,000/);
  });

  it("says plainly when a page carries nothing a media kit normally carries", () => {
    const profile = parseMediaKit("<p>Coming soon</p>");
    expect(profile.sparse).toBe(true);
    expect(profile.summary).toMatch(/ask for a media kit/i);
  });
});

/* ------------------------------------------------------------------- collab */

const creator = (overrides: Partial<CreatorCandidate> = {}): CreatorCandidate => ({
  website: "https://amara.example",
  creatorName: "Amara",
  contactEmail: "bookings@amara.example",
  followers: [{ platform: "instagram", followers: 120_000, raw: "" }],
  totalReach: 120_000,
  rates: [{ deliverable: "post", amount: 800, currency: "USD", raw: "" }],
  audience: [{ kind: "engagement", value: "4.5%", raw: "" }],
  partners: ["Glossier"],
  niches: ["beauty", "skincare"],
  sparse: false,
  summary: "",
  ...overrides,
});

describe("entryRate", () => {
  it("returns the cheapest published rate as the realistic entry point", () => {
    const result = entryRate(
      creator({
        rates: [
          { deliverable: "video", amount: 2500, currency: "USD", raw: "" },
          { deliverable: "post", amount: 800, currency: "USD", raw: "" },
        ],
      }),
    );
    expect(result?.amount).toBe(800);
  });

  it("returns nothing when no rate is published", () => {
    expect(entryRate(creator({ rates: [] }))).toBeNull();
  });
});

describe("suggestStructure", () => {
  it("suggests gifted product for a small audience with no published rate", () => {
    expect(suggestStructure({ entry: null, reach: 8_000 })).toBe("gifted");
  });

  it("suggests gifted when the rate is above the budget", () => {
    expect(suggestStructure({ budget: 300, entry: { amount: 800, currency: "USD" }, reach: 120_000 })).toBe("gifted");
  });

  it("suggests paid when the budget covers the rate", () => {
    expect(suggestStructure({ budget: 2000, entry: { amount: 800, currency: "USD" }, reach: 120_000 })).toBe("paid");
  });

  it("leans on performance structures for a sales goal", () => {
    expect(suggestStructure({ budget: 2000, entry: { amount: 800, currency: "USD" }, reach: 120_000, goal: "sales" })).toBe("hybrid");
    expect(suggestStructure({ entry: null, reach: 120_000, goal: "sales" })).toBe("affiliate");
  });
});

describe("scoreMatch", () => {
  const brand = { name: "Lumen Skincare", category: "skincare", budget: 3000, currency: "USD" };

  it("rewards a creator whose published niche matches the brand", () => {
    const onTopic = scoreMatch(brand, creator());
    const offTopic = scoreMatch(brand, creator({ niches: ["gaming", "tech"] }));
    expect(onTopic.score).toBeGreaterThan(offTopic.score);
    expect(onTopic.reasons.join(" ")).toMatch(/skincare/);
  });

  it("prefers relevance over raw reach", () => {
    const smallRelevant = scoreMatch(brand, creator({ totalReach: 20_000 }));
    const hugeIrrelevant = scoreMatch(brand, creator({ totalReach: 2_000_000, niches: ["gaming"] }));
    expect(smallRelevant.score).toBeGreaterThan(hugeIrrelevant.score);
  });

  it("raises a concern instead of hiding an unaffordable rate", () => {
    const match = scoreMatch(
      { ...brand, budget: 200 },
      creator({ rates: [{ deliverable: "post", amount: 5000, currency: "USD", raw: "" }] }),
    );
    expect(match.concerns.join(" ")).toMatch(/above the stated budget/i);
    expect(match.suggestedStructure).toBe("gifted");
  });

  it("flags a creator with no published figures rather than scoring them blind", () => {
    const match = scoreMatch(brand, creator({ totalReach: 0, followers: [], rates: [], audience: [] }));
    expect(match.concerns.join(" ")).toMatch(/no audience figures/i);
    expect(match.concerns.join(" ")).toMatch(/no published rates/i);
  });

  it("notes a missing contact route, because it changes what happens next", () => {
    const match = scoreMatch(brand, creator({ contactEmail: null }));
    expect(match.concerns.join(" ")).toMatch(/no published contact/i);
  });

  it("rewards a shared city over a shared country", () => {
    const sameCity = scoreMatch({ ...brand, city: "Lagos", country: "Nigeria" }, creator({ city: "Lagos", country: "Nigeria" }));
    const sameCountry = scoreMatch({ ...brand, city: "Lagos", country: "Nigeria" }, creator({ city: "Abuja", country: "Nigeria" }));
    expect(sameCity.score).toBeGreaterThan(sameCountry.score);
  });

  it("always produces a score inside the stated range", () => {
    for (const candidate of [creator(), creator({ niches: [] }), creator({ totalReach: 0, rates: [] })]) {
      const match = scoreMatch(brand, candidate);
      expect(match.score).toBeGreaterThanOrEqual(0);
      expect(match.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("matchCreators", () => {
  it("ranks the roster with the best fit first", () => {
    const matches = matchCreators({ name: "Lumen", category: "skincare" }, [
      creator({ creatorName: "Gamer", niches: ["gaming"] }),
      creator({ creatorName: "Beauty", niches: ["skincare", "beauty"] }),
    ]);
    expect(matches[0].creator.creatorName).toBe("Beauty");
  });

  it("returns an empty list for an empty roster", () => {
    expect(matchCreators({ name: "Lumen", category: "skincare" }, [])).toEqual([]);
  });
});

describe("defaultDeliverables", () => {
  it("asks for nothing guaranteed on a gifted collaboration", () => {
    const deliverables = defaultDeliverables("gifted");
    expect(deliverables.join(" ")).toMatch(/if the product fits/i);
  });

  it("shapes deliverables around the campaign goal", () => {
    expect(defaultDeliverables("paid", "launch").join(" ")).toMatch(/launch-day/i);
    expect(defaultDeliverables("paid", "content").join(" ")).toMatch(/no posting obligation/i);
  });
});

describe("buildCollabBrief", () => {
  const brand = { name: "Lumen Skincare", category: "skincare", budget: 3000, currency: "USD" };

  it("states the fit, the structure and where the figures came from", () => {
    const match = scoreMatch(brand, creator());
    const brief = buildCollabBrief({ agencyName: "Atlas Studio", brand, match });

    expect(brief.html).toContain("Lumen Skincare");
    expect(brief.html).toContain("Amara");
    expect(brief.html).toMatch(/as published by\s+the creator/i);
    expect(brief.html).toMatch(/have not been independently verified/i);
  });

  it("requires disclosure of a paid or gifted partnership", () => {
    const match = scoreMatch(brand, creator());
    expect(buildCollabBrief({ agencyName: "Atlas", brand, match }).html).toMatch(/disclosure/i);
  });

  it("escapes untrusted creator and brand names", () => {
    const match = scoreMatch({ ...brand, name: "<script>alert(1)</script>" }, creator({ creatorName: "<b>x</b>" }));
    const brief = buildCollabBrief({ agencyName: "Atlas", brand: { ...brand, name: "<script>alert(1)</script>" }, match });
    expect(brief.html).not.toContain("<script>alert(1)</script>");
    expect(brief.html).toContain("&lt;script&gt;");
  });
});
