# Finder Verification Notes

The production-style preview was checked on a 1280px desktop viewport and a 375px mobile viewport. The editorial layout, visual assets, navigation hierarchy, responsive stacking, discovery table, record detail panel, growth messaging, FAQ, and footer render as intended. An independent visual review judged the Atlas Field Notes direction strong and ready to ship.

The live Finder search was tested with the Austin, Texas query. It successfully queried public business-listing data, filtered the returned record set to businesses without a listed standalone website, updated the visible lead table and selected opportunity profile, and surfaced the corresponding map context. Finder also retains a clearly labeled illustrative preview if live source data is not yet available.

The main interactions that are intentionally prototype-only, including export and opening a public source from an illustrative record, provide contextual status messages rather than a dead-end.

## International Coverage Update

Finder now presents a dedicated region selector with only **Europe**, **Americas**, and **Asia** as selectable market groups. The selector dynamically limits country choices to its selected group; the Europe test exposed the full European country list, while no African country or Africa-wide option is available. The coverage registry contains 129 eligible countries and validates explicit Africa-related location terms before it runs a search.

The selector was subsequently switched to **Asia**, which replaced the country menu with the full Asia list, including Japan, India, Singapore, Thailand, and the other supported Asian markets. This confirms that a region change updates country availability and the active research-file label without exposing African markets.

The expanded search card now clearly states that Africa is excluded and that a limited-presence result is only a public-listing signal. The region dropdown itself exposes only the three supported groups, keeping African countries outside the selectable search path.

## Fresh Hiring Workspace

Finder now renders a dedicated fresh-hiring section alongside the website-opportunity workflow. The browser exposed an arbitrary role input, eligible-region and country selectors, eight role/skill quick picks, a five-day search action, and the planned live-result area. The role controls include product management, social growth, web development, content, copywriting, co-founder, biochemistry, and cosmetics operations.

The desktop rendering confirmed that the hiring workspace preserves Finder’s editorial research treatment while separating the strict freshness controls, job-result feed, and public-data-only AI briefing surface into clear, scannable panels.

The live Product Manager query returned ten source-attributed Jobicy listings for the United States. Each visible record showed a company, role, source geography, employment type, and a calculated freshness label ranging from nine hours to three days. The selected company profile exposed the public job-source link and the sign-in protected AI-brief action, confirming that live sourcing and the strict five-day result filter are working end to end.

The hiring-region selector was also switched to Asia, exposing the Asia-only country list and no African markets. The resulting cards retained each source-listed geography, which is important when the public provider does not offer a direct country filter for the selected country; Finder must make that limitation visible rather than imply a false exact-country match.

After refining the server adapter, Finder’s source note now states that it applies either a direct country filter or the provider’s documented regional filter. The UI continues to show the selected Asian country context while the server applies Jobicy’s APAC scope and labels the result precision accordingly.

Finder’s server-side role-relevance test now removes unrelated job titles after the provider query. The public API procedure was checked directly using an Asia Product Manager search and returned only the role-relevant fresh result, rather than the broad manager set supplied by the upstream source.

The final United States Product Manager browser test returned three relevant Jobicy roles—all with a source geography, company, title, source link, and original publication age at or below five days. The selected profile now exposes an explicit **Find public contact** control that performs an on-demand public listing lookup rather than presenting placeholder contact data. The results footer labels the direct United States source filter and the five-day maximum.

The on-demand contact control was invoked against the selected Smartsheet public job profile. Finder deliberately keeps this lookup separate from the job source: it requests only publicly listed company phone, website, address, and listing-link data when available, and otherwise returns an explicit no-record state rather than inventing contact information.

The public-directory lookup completed successfully for the selected fresh Smartsheet role. It returned a public phone number, public company website, public address, and a public listing link; the interface exposed each item as a direct, clearly labelled public-data field. The authenticated AI-brief procedure is also covered by a contract test that verifies a source-bound result, evidence list, five-day reference, and the absence of any invented personal contact information.
