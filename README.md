# Gas Safe Register UK Business Search

Search the public Gas Safe Register by UK town or postcode. Export canonical business records with public contact details, address, registration number, engineer names and status, and Domestic/Commercial qualification tables.

**Beta access status:** a clean-session private cloud run completed search and detail enrichment for one live business through a GB residential proxy. A separate Commercial search and a second postcode search also returned live records. This is limited evidence; the source may block requests, and the Actor does not guarantee availability, result counts, or complete coverage. Do not rely on it for safety-critical verification; check current status directly on the official Gas Safe Register.

## Quick start

For local regression, `offlineTest` uses clearly labelled synthetic fixtures and makes no source or proxy requests. The Apify input form defaults to one bounded live search:

```json
{
  "mode": "scrape",
  "location": "CB1 1JY",
  "browserProfile": "patchrightHeaded",
  "useUkResidentialProxy": true,
  "proxyService": "residential",
  "proxyCountry": "GB",
  "page": 1,
  "maxPages": 1,
  "maxResults": 1,
  "includeEngineers": true,
  "includeQualifications": true,
  "maxEngineerPages": 1,
  "maxEngineersPerBusiness": 1,
  "maxRuntimeSeconds": 120,
  "maxNetworkRequests": 300,
  "maxTransferMegabytes": 10,
  "loadPageAssets": false,
  "settleSeconds": 5
}
```

The Store prefill uses bounded live settings and requests Apify's GB residential proxy. Proxy and compute usage are billed separately by Apify. Resource limits reduce exposure but are not a fixed USD run-cost cap.

## Inputs

- `location`: one UK town or postcode; default `CB1 1JY`.
- `locations`: optional array of up to ten towns/postcodes; overrides `location`. All locations share `maxResults` and resource budgets.
- `searchMethod`: siteUi (default) uses the search button; keyboard presses Enter; validatedForm sends the observed `/tpv` AJAX validation request with the current in-browser form token and then submits normally; nativeForm posts the public form without client-side AJAX validation. Server validation and access controls still apply.
- `locationCounty`: exact county label when matching towns differ. Duplicate identical labels are resolved to the first identical match. Different towns are never selected silently.
- `serviceType`: Domestic or Commercial, default Domestic.
- `page`: first listing page, default 1. `maxPages`: consecutive pages per location, 1–25, default 1.
- `maxResults`: global unique business cap, 1–250, default 1. Increase for larger runs.
- `includeEngineers` and `includeQualifications`: default true. Qualifications require engineer enrichment.
- `maxEngineerPages`: default 1, maximum 10. `maxEngineersPerBusiness`: default 1, maximum 100. Increase for broader per-business coverage.
- `browserProfile`: browser implementation used for source requests. The prefilled experimental Patchright profile succeeded in one private cloud run; this is not evidence that new users will have access. `unblockerHttp` is diagnostic only and cannot run full scraping.
- `useUkResidentialProxy`: enables the selected proxy service; legacy field name retained. Default false.
- `proxyService`: residential or unblocker. `proxyCountry`: GB or AUTO. AUTO may use a non-UK route. Unblocker has no sticky sessions.
- `maxRuntimeSeconds`: 15–180, default 120. Platform timeout is an additional safeguard.
- `maxNetworkRequests`: 10–300, default 80; counts browser requests as well as navigations. Higher settings can increase runtime and proxy bandwidth; the 300-request maximum is a resource ceiling, not a billing cap.
- `maxTransferMegabytes`: 1–10, default 10. Completed-response measurement is best effort; in-flight data can overshoot.
- `requestDelayMillis`: 500–10000, default 1000; one browser/page and sequential navigations.
- `loadPageAssets`: default false. Enable for compatibility testing; costs can increase.
- `settleSeconds`: 0–10, default 5; initial homepage JavaScript settling time.
- `allowUnblockerCertificateException`: default false, optional isolated source-host-only diagnostic exception. Never enables a global TLS bypass; unnecessary for normal residential requests.

## Output

Each dataset row represents one unique business registration number. Fields include `business_name`, `trading_name` (from engineer detail when available), `registration_number`, `telephone`, `email`, structured `address`, `distance_miles`, `out_of_hours_available`, `location`, `service_type`, detail URLs, timestamp, and `source_kind` (`live` or `synthetic_fixture`).

`engineers` contains name, public telephone where supplied, displayed registration status, service categories, qualifications URL and parsed qualifications. No registration status is inferred solely from appearing in search. Photos are not downloaded for output.

Each qualification contains `category`, `service`, `natural_gas`, `lpg`, `building_regulations` and `is_group`. Flags distinguish an explicit check (`true`), cross (`false`) and blank (`null`). Both table categories are parsed, including hidden Commercial/Domestic panels present in the document. The flattened business `qualifications` array adds `engineer_name`.

`enrichment_status`, `enrichment_error`, `engineers_truncated` and per-engineer qualification status make partial data explicit. An inaccessible detail page preserves the business record, marks enrichment failed/partial, and stops further requests on a detected source block or resource limit.

The `RESULTS` key-value record contains businesses plus per-location pagination metadata. `RUN-SUMMARY` contains status, errors, request count, observed transfer, timestamps and page statistics. Dataset exports support JSON, CSV and Excel through Apify. Nested engineer/qualification arrays are best exported as JSON.

## Coverage and failures

The source randomizes ordering on each page request. Walking all pages can repeat businesses and omit others. Results are deduplicated by registration number; `duplicates_skipped` is reported per location. `pagination_exhausted` only means all available listing pages in that traversal were processed, **not** that every business was collected. `completeness_guaranteed` is always false.

Only an explicit no-results message is accepted as empty; a confirmed empty search is a successful run with zero records. Block pages, unknown layouts, ambiguous locations and out-of-range pages produce explicit errors. Earlier records remain available when a later request fails. Late-arriving Cookiebot and survey dialogs are handled before ordinary browser actions. The Actor retries an idempotent detail/listing-page visit once after a narrow set of transient transport failures, with a short delay. It does not retry searches, source blocks, validation failures, or resource-limit errors, and does not rotate proxies or use external CAPTCHA services.

Runs can be resurrected with unchanged input. Existing canonical dataset rows are loaded and skipped on subsequent traversals. There is no guarantee that randomized source ordering stays stable after restart. A fresh run is required for changed input. Dataset writes are append-only; platform write ambiguity can still require consumer deduplication by registration number.

## Cost controls

Private Actor compute, proxy bandwidth/Unblocker units and storage consume platform credit. Included credit is still usage. Request/transfer/runtime/result/page caps limit exposure but are not an invoice guarantee. The API `maxTotalChargeUsd` option applies to pay-per-event Actor fees and does not cap this private Actor's platform resources.

Small development tests are supervised and targeted well below $0.30 each. A full multi-page/enriched crawl can cost more and requires separately chosen budgets. There are no schedules or recurring runs. Do not publish or advertise this beta as reliable before successful fresh cloud runs across representative towns/postcodes and detail pages.

## Development

Use Node.js 24, `npm ci`, `npm run build`, `npm run lint`, `npm test`, then `apify validate-schema`. Run locally with `apify run --user-agent apify-codex-plugin/apify-actor-development`; cloud storage is separate from local storage.

The pinned Dockerfile combines official Chrome and Camoufox browser assets. Dependencies use the committed lockfile; native packages compile only in the builder stage. Tokens are read by the Apify SDK/CLI and are never embedded in source, output or logs. Crawled HTML and onclick attributes are parsed as data and never executed outside the browser.

To run the delayed-dialog browser regression tests with local Chrome installed, set `RUN_BROWSER_TESTS=1` before `npm test`. These tests use synthetic pages and make no external requests.

Private beta note: the earlier verified cloud run used an owner-only session cookie secret. Cookie import is disabled unless the private runtime flag `GAS_SAFE_USE_PRIVATE_COOKIES=true` is set. Do not enable that flag or expose personal session cookies on a public Actor; clean-session access and source permission requirements must be resolved before a public paid launch. For pay-per-event runs, a spending-limit preflight refuses to start browser/proxy work if the user's maximum charge cannot cover one result, then checks again before doing enrichment for each next business. Dataset-item charges occur only when a completed business record is saved. Confirmed empty searches are successful and are not charged as dataset results; failed scrapes and blocked requests produce explicit run-summary errors.


Experimental Patchright profile: patchrightHeaded uses the pinned Patchright Chromium driver with branded Chrome. A local Windows comparison returned one live business while standard Playwright was blocked on the same observed GB proxy exit. This is one comparison, not a reliability guarantee. GAS_SAFE_PROXY_SESSION can pin an alphanumeric proxy session for controlled comparisons; GAS_SAFE_VERIFY_PROXY=1 verifies GB egress against Apify browser-info and records only a hashed IP fingerprint. These options do not override resource limits. Cloud validation remains separate.
