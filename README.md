# Gas Safe Register UK Business Search

Search the public Gas Safe Register by UK town or postcode. Export canonical business records with public contact details, address, registration number, engineer names and status, and Domestic/Commercial qualification tables.

**Access status:** a clean-session cloud run through a GB residential proxy returned a live business record on 15 October 2026. The source may still block requests, and the Actor does not guarantee availability, result counts, or complete coverage. Do not rely on it for safety-critical verification; check current status directly on the official Gas Safe Register.

## Quick start

Open the **Input → Form** tab, enter a town or postcode, select the service type and number of businesses, choose whether to include engineers and qualifications, and click **Start**. The default is 10 businesses with both detail options enabled. Listing depth, navigation pacing, browser and proxy settings are managed automatically.

The JSON example below is only for API integrations; Console users do not need it.

```json
{
  "location": "CB1 1JY",
  "serviceType": "Domestic",
  "maxResults": 10
}
```

The Store uses 1 GB of run memory. Browser runtime, request and transfer ceilings are calculated automatically from the requested business count and selected enrichment. For the default 10 businesses with full enrichment these ceilings are 720 seconds, 1,800 requests and 50 MB. The platform timeout defaults to unlimited; the internal browser ceiling still stops the crawl. It requests Apify's GB residential proxy. Check the current Pricing tab for Actor fees and whether platform usage is included. Resource limits reduce exposure but are not a fixed USD run-cost cap.

For a search showing 50 results across five pages, set `maxResults` to `50`. The default is `10`; earlier diagnostic runs explicitly requested only one result. A saved task or copied input can retain `maxResults: 1` or `maxPages: 1`, so remove those overrides for a full search. The `OUTPUT.data` record includes `requested_max_results` and `stop_reason` to distinguish a requested limit, the page ceiling, exhausted pagination, and a failure. A larger requested count can cost more and may still stop early at a resource or spending limit.

## Inputs

- `location`: one UK town or postcode; default `CB1 1JY`. If a town is ambiguous, enter `Town, County` (for example, `London, Middlesex`) or use a full postcode.
- `serviceType`: Domestic or Commercial; default Domestic.
- `maxResults`: maximum unique business records, 1–250; default 10. The Actor continues through listing pages until it reaches this count or the internal 25-page safety ceiling; duplicate results can mean fewer than requested. API callers may set `maxPages` to impose a lower page limit. Use Include engineers and Include qualifications checkboxes to choose detail depth. Pacing, browser, proxy and automatically sized resource limits remain managed internally.

### API operations

The standard Console form stays simple. API clients can set the hidden `operation` field to use all three API workflows:

- `searchBusinesses`: search a town/postcode, follow `page` and `maxPages` pagination limits, and include available engineer and qualification data.
- `searchBusinessesBasic`: return businesses without visiting engineer pages. `maxPages` is accepted and `maxResults` defaults to up to ten rows per requested page, capped at 250.
- `getBusinessEngineers`: set `registrationNumber` (or Parse.bot-compatible `registration_number`) to return one business and its engineer/qualification data.

Snake-case Parse.bot field names are accepted for `service_type`, `max_pages`, `include_engineers`, and the three operation names. Each business is written as a dataset item. `OUTPUT` in the default key-value store contains the response envelope and pagination metadata (`total_results`, `total_pages`, `pages_fetched`, `last_page`, and `has_more`). Use the Apify API to read the dataset and `OUTPUT` record after a run.

## Output

Each dataset row represents one unique business registration number. Fields include `business_name`, `trading_name` (from engineer detail when available), `registration_number`, `telephone`, `email`, structured `address`, `distance_miles`, `out_of_hours_available`, `location`, `service_type`, detail URLs, timestamp, and `source_kind` (`live` or `synthetic_fixture`).

`engineers` contains name, public telephone where supplied, displayed registration status, service categories, qualifications URL and parsed qualifications. No registration status is inferred solely from appearing in search. Photos are not downloaded for output.

Each qualification contains `category`, `service`, `natural_gas`, `lpg`, `building_regulations` and `is_group`. Flags distinguish an explicit check (`true`), cross (`false`) and blank (`null`). Both table categories are parsed, including hidden Commercial/Domestic panels present in the document. The flattened business `qualifications` array adds `engineer_name`.

`enrichment_status`, `enrichment_error`, `engineers_truncated` and per-engineer qualification status make partial data explicit. An inaccessible detail page preserves the business record, marks enrichment failed/partial, and stops further requests on a detected source block or resource limit.

Use the Form tab: enter a town/postcode, select Domestic or Commercial, choose Maximum unique businesses, then choose the two enrichment checkboxes and click Start. No JSON editing is needed. The Output tab has separate Businesses, Engineers and Qualifications table views. Business rows show a readable address, engineer names and counts. Engineer and qualification views expand the data into individual rows. The readable results link opens all three full tables; separate CSV links open in Excel or other spreadsheets.

The `RESULTS` key-value record contains businesses plus per-location pagination metadata. `RUN-SUMMARY` contains status, errors, request count, observed transfer, timestamps and page statistics. Dataset exports support JSON, CSV and Excel through Apify. Use the separate flat Engineers and Qualifications CSV downloads for spreadsheets; the nested API fields remain available for integrations.

## Coverage and failures

The source randomizes ordering on each page request. Walking all pages can repeat businesses and omit others. Results are deduplicated by registration number; `duplicates_skipped` is reported per location. `pagination_exhausted` only means all available listing pages in that traversal were processed, **not** that every business was collected. `completeness_guaranteed` is always false.

Only an explicit no-results message is accepted as empty; a confirmed empty search is a successful run with zero records. Block pages, unknown layouts, ambiguous locations and out-of-range pages produce explicit errors. Ambiguous town errors include the source's matching choices and accept a disambiguation in the same location field as `Town, County`; the Actor never guesses between places. Earlier records remain available when a later request fails. Late-arriving Cookiebot and survey dialogs are handled before ordinary browser actions. A stalled search or transient search transport failure gets one fresh form attempt. An idempotent detail/listing-page visit gets one retry after a narrow set of transient transport failures. Source blocks, validation failures and resource-limit errors are not retried. The Actor does not rotate proxies or use external CAPTCHA services. The readable report and spreadsheet exports preserve any collected records and show partial/failed status.

Runs can be resurrected with unchanged input. Existing canonical dataset rows are loaded and skipped on subsequent traversals. There is no guarantee that randomized source ordering stays stable after restart. A fresh run is required for changed input. Dataset writes are append-only; platform write ambiguity can still require consumer deduplication by registration number.

## Cost controls

Compute, proxy bandwidth/Unblocker units and storage consume platform credit. Included credit is still usage. Request/transfer/runtime/result/page caps limit exposure but are not an invoice guarantee. The API `maxTotalChargeUsd` option applies to pay-per-event Actor fees and does not cap platform resources.

Small development tests are supervised and targeted well below $0.30 each. A full multi-page/enriched crawl can cost more and requires separately chosen budgets. There are no schedules or recurring runs.

## Development

Use Node.js 24, `npm ci`, `npm run build`, `npm run lint`, `npm test`, then `apify validate-schema`. Run locally with `apify run --user-agent apify-codex-plugin/apify-actor-development`; cloud storage is separate from local storage.

The pinned Dockerfile combines official Chrome and Camoufox browser assets. Dependencies use the committed lockfile; native packages compile only in the builder stage. Tokens are read by the Apify SDK/CLI and are never embedded in source, output or logs. Crawled HTML and onclick attributes are parsed as data and never executed outside the browser.

To run the delayed-dialog browser regression tests with local Chrome installed, set `RUN_BROWSER_TESTS=1` before `npm test`. These tests use synthetic pages and make no external requests.

The Actor always starts a clean browser session and does not import account cookies. For pay-per-event runs, a spending-limit preflight refuses to start browser/proxy work if the user's maximum charge cannot cover one result, then checks again before doing enrichment for each next business. Dataset-item charges occur only when a completed business record is saved. Confirmed empty searches are successful and are not charged as dataset results; failed scrapes and blocked requests produce explicit run-summary errors.


Experimental Patchright profile: patchrightHeaded uses the pinned Patchright Chromium driver with branded Chrome. A local Windows comparison returned one live business while standard Playwright was blocked on the same observed GB proxy exit. This is one comparison, not a reliability guarantee. GAS_SAFE_PROXY_SESSION can pin an alphanumeric proxy session for controlled comparisons; GAS_SAFE_VERIFY_PROXY=1 verifies GB egress against Apify browser-info and records only a hashed IP fingerprint. These options do not override resource limits. Cloud validation remains separate.
