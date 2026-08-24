# Finder Design Direction

## Three Visual Approaches

| Theme Name | Very Brief Intro | Probability |
| --- | --- | --- |
| Atlas Field Notes | An editorial research desk: cream paper, ink-black type, lime measurement marks, and records that feel carefully verified. It signals diligence, clarity, and a human research process. | 0.07 |
| Signal Room | A darker, operations-center direction built around scanning lines, cobalt data blocks, and an urgent outbound-sales energy. It emphasizes velocity and scale. | 0.03 |
| Neighbourhood Ledger | A warm civic-directory feel, inspired by local newspapers and hand-marked maps. It makes prospecting feel grounded in real communities rather than anonymous datasets. | 0.09 |

## Chosen Approach: Atlas Field Notes

### Design Movement

**Modern editorial data product** with the spatial rhythm of a field journal and the precision of a research dashboard. It takes the reference site's restrained conversion structure and makes the discovery experience more tangible, giving users a feeling of opening a well-kept catalogue of commercial opportunity.

### Core Principles

1. **Evidence before embellishment.** Every visual accent should imply a checked record, a location, or a useful next action.
2. **Asymmetric utility.** The page alternates between broad editorial statements and compact tools rather than relying on a centered-card landing-page template.
3. **Calm contrast.** Soft paper tones create room to scan; charcoal establishes confidence; acid lime directs attention only to verified opportunities and decisive actions.
4. **Tactile precision.** Fine ruled lines, index numbers, small labels, and measured spacing evoke a real working file without becoming retro pastiche.

### Color Philosophy

The base is **warm parchment** (#F7F6F1), which softens what could otherwise be an aggressive sales tool and supports long-form scanning. **Ink black** (#1D241F) carries structure, authority, and legibility. The signature **Scout Lime** (#C8FF3D) is reserved for high-intent actions, verification indicators, and active search states, mimicking a physical highlighter on a critical finding. A faded stone (#E7E5DE) provides quiet containment for secondary controls.

### Layout Paradigm

The experience uses a **research-sheet composition**: a quiet navigation rail at the top, a split editorial hero with a live search module tucked into the right edge, an oversized CSV-like discovery table, and a dark "fulfilment dossier" section. Content is intentionally left-anchored on desktop and becomes a stacked field notebook on mobile. It avoids generic centered blocks and repeated card grids.

### Signature Elements

1. **Scout mark:** a three-node compass/locator glyph made from a circular center, directional ticks, and a lime position pin.
2. **Verification strip:** a compact dark-green strip with a pulsing lime dot, used to label no-site checks and fresh records.
3. **Ledger rules:** hairline table dividers and tiny uppercase metadata labels that structure data without heavy containers.

### Interaction Philosophy

Interactions should make users feel they are narrowing a field of opportunity. Search controls are direct and tactile; filter changes update results immediately; saving a lead changes the action from outline to a clear lime confirmation. Nonfunctional commercial actions transparently show a short "prototype action" toast rather than creating a dead-end.

### Animation

Use short, purposeful transitions only. The hero utility panel enters with a 220ms upward fade; result rows stagger in by 40ms after a search; lime status dots pulse slowly to signify active verification; hover lifts are restrained at 2px. Buttons use a 140ms press scale and a sharp custom ease-out. All optional motion is disabled under `prefers-reduced-motion`.

### Typography System

**Space Grotesk** is the primary display face, used in 600–700 weights for assertive yet humane headlines. **DM Mono** handles labels, filenames, metadata, and lead counts for data credibility. **Manrope** is used for body text and table readability. Headings are tightly tracked and large; metadata stays uppercase, compact, and clearly separated from body copy.

### Brand Essence

**Finder is the research desk for web studios that want a verified pipeline of businesses still missing their digital front door.** Personality: **methodical, direct, optimistic.**

### Brand Voice

Headlines are specific and opportunity-led; CTAs sound like a next research step, not generic SaaS encouragement. Microcopy explains what is checked and what the user can do with it.

> "Find the businesses the web forgot."

> "Open a fresh set of opportunities"

### Wordmark & Logo

The logo combines a compact **directional compass node** with a crisp lowercase wordmark. The symbol has three tiny outward nodes orbiting a larger lime-centered point to suggest globally distributed, pinpointed businesses. It is used as a bold standalone app icon in the navigation and browser identity—not as a tiny decorative badge.

### Signature Brand Color

**Finder Lime — #C8FF3D.** It is the unmistakable indicator of a discovered, verified, actionable business opportunity.
