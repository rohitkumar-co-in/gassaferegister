# Leadomi Gas Safe Collector — Chrome extension

This extension works inside your existing Chrome Gas Safe tab, using the same browser profile, session and network routing as that tab. It needs no Python launcher, Parse.bot key or API account. A Chrome VPN extension may cover the tab, depending on its routing; test that Gas Safe searches work in that tab first. The extension does not bypass geographic restrictions, security challenges or access denial.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `gas-safe-chrome-extension` folder (the folder containing `manifest.json`). If you downloaded the ZIP, extract it first.
5. Pin **Leadomi Gas Safe Collector** from Chrome's Extensions menu.
6. Refresh an already-open Gas Safe tab after installing or updating the extension.

## Collect

1. Connect your VPN if needed. Open https://www.gassaferegister.co.uk/ in the SAME Chrome profile.
2. Use the site's normal search: city/postcode and Domestic or Commercial. Wait for business results to appear.
3. Click the extension. Confirm the search location and service type match the site's search. The extension starts from the current results page; it does not submit a new search or change the site's service filter.
4. Choose the result page limit (e.g. 2), engineer page limit per business (e.g. 5), and whether to include engineers/qualifications.
5. Click **Collect from current results**. Leave that tab open and do not navigate it yourself. The popup can close; the collection continues as pages load.
6. Reopen the popup for progress, Stop, Export JSON or Export CSV. Export is available for collected partial results too. Starting a new run replaces the previous in-extension dataset, so export first.
7. Import completed JSON into the local leads dashboard using its Gas Safe import panel if desired. Partial exports are labelled `partial`; review them before importing.

## Behavior and limits

- Reads the actual DOM using selectors from the supplied real HTML; no separate Edge window and no third-party collection server.
- Restricts page links and content scripts to the Gas Safe domain. Permissions are `storage` and `activeTab`; no access to all websites, cookies, passwords or browsing history.
- Stores records locally in Chrome extension storage. Exports are local downloads. No analytics or external uploads.
- Follows actual pagination and detail links with a 1.5-second delay between page visits, in the same tab/session.
- Deduplicates businesses by registration number and engineers by name/telephone.
- Checks a detail page's business name AND phone before attaching it. Engineers are not inferred owners. Partial engineer totals remain explicit.
- Qualifications and out-of-hours flags are source statements; neither establishes missed-call problems or interest in Leadomi.
- Stops on unsupported/blocked pages, expired sessions, unexpected business details or repeated pagination; collected records stay exportable.
- The source search session can expire. A successful UK IP search does not guarantee every subsequent automated page request succeeds.
- Parser extraction is tested against your saved pages. Installed Chrome extension navigation still needs a live test on your allowed connection.

## Troubleshooting

**Could not establish connection / receiving end does not exist:** refresh the Gas Safe page after loading the extension.

**Unexpected link / unsupported results:** start on the successful Gas Safe business results page, not the localhost scraper page.

**Paused:** export partial results, perform a fresh normal search, then start a new collection. Do not attempt challenge bypass.

**Counts below the source total:** page limits, random ordering or incomplete engineer pages can produce fewer unique records. The JSON preserves source totals separately.


## Version 1.1 — interrupted details fix

A missing or differently formatted business telephone no longer stops enrichment when the business name and the original business-specific Gas Safe URL both match. Phone comparisons normalise spaces and +44/0044 formatting. Missing '-' or 'n/a' contacts export as blank rather than fake values.

CSV now includes `engineers_status`, `services_status`, `collection_errors`, and `collection_status`. A blank engineer result means not fetched or interrupted unless an explicit successful source result establishes otherwise. `engineers_complete` is blank until engineer pages have actually been fetched.

Isolated identity mismatches are logged per business and skipped, so later detail tasks continue. Actual access blocks/unsupported pages pause the run and preserve the pending URL. Use **Resume interrupted collection** from the same Gas Safe Chrome tab after checking access. Expired links may still require a fresh normal search and a new collection.

To update without losing local extension storage, export your old JSON first, then replace the files INSIDE the existing extension folder, click Reload on the existing extension at chrome://extensions, and refresh the Gas Safe tab. Avoid removing/reinstalling it in a different folder if you want to retain the previous run. A Resume operation keeps existing records and continues the pending queue; it cannot recover data absent from a CSV alone.

The supplied failing CSV contained 49 unique registrations, with engineer/qualification details present only for the first three businesses. The CSV has no original run stop reason; version 1.1 addresses the observed missing-phone failure path and adds diagnostics for other interruptions.
