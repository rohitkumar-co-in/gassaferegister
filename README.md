# Gas Safe Register UK Business Search

Search the public Gas Safe Register by one UK town or postcode. Collect business registration and contact details, then optionally add engineer and qualification data.

Availability and result counts depend on the source. The Actor can be blocked, interrupted, or return partial results; it does not guarantee complete coverage. Verify current registration status directly with the official Gas Safe Register when it matters.

## Pricing

Apify charges event fees as follows:

- **Business record:** $0.10 for each unique business saved to the dataset.
- **Engineer details:** an additional $0.05 for each business when engineer details are returned.
- **Qualification details:** an additional $0.05 for each business when qualification details are returned.
- **Actor start:** $0.00005 per start event at 1 GB of memory (Apify charges one start event per GB, with a minimum of one).

A business with both engineer and qualification data returned costs $0.20 in event fees. If either optional detail set is not requested or no corresponding data is returned, its add-on event is not charged. Event fees are gross charges; Apify platform usage, including Actor compute and proxy usage, is separate and varies by run. Check the Actor's Pricing page and run cost breakdown for the current total.

## Start a search

1. Open **Input → Form** in Apify Console.
2. Enter a town or postcode.
3. Choose **Domestic** or **Commercial** service.
4. Set the maximum number of unique businesses (1–250; default 10).
5. Choose whether to include engineers and qualifications. Qualifications require engineers.
6. Start the run.

The Actor follows listing pages as needed, up to its internal safety limit, and deduplicates businesses by registration number. A requested maximum is a limit, not a promise: the source may provide fewer results, repeat listings between pages, block the run, or stop traversal early. There are about ten listings per source page, but page contents and totals can change.

The default form searches CB1 1JY for Domestic businesses, requests up to 10 unique businesses, and enables both detail options.

## Results

Each dataset item represents a unique business registration. Business fields include the registered name, registration number, public telephone and email when available, address, distance, service type, and source detail links.

When available and selected, engineer data includes public names, displayed registration status, contact details, and service information. Qualification rows include category, service, Natural Gas, LPG, and Building Regulations indicators. A check is represented as `true`, a cross as `false`, and a blank as `null`.

The Actor reports enrichment status and errors so partial detail collection is visible. It does not infer an engineer's registration status from their appearance in a result. The Console output includes business, engineer, and qualification views when those records exist, along with downloadable dataset exports.

## Errors and partial results

Confirmed no-results searches can complete successfully with zero businesses. Ambiguous towns, blocked pages, changed page layouts, invalid requests, and exhausted resource limits are reported as errors or partial outcomes. Previously saved businesses remain available if a later page or detail request fails. Limited retries apply only to selected transient navigation failures; source blocks and validation or resource-limit errors are not retried.

Listing order can change between requests. Deduplication prevents repeated registration numbers in a run, but traversing every page does not guarantee that every business was found. Use a fresh run when changing the search input.

## Development

Use Node.js 24 and the committed lockfile:

```sh
npm ci
npm run build
npm run lint
npm test
apify validate-schema
```

Browser regression tests use synthetic pages and do not make external requests. Set `RUN_BROWSER_TESTS=1` to enable them when local Chrome is installed. Run locally with `apify run`; local storage is separate from Apify cloud storage.
