# Access research — 15 October 2026

Sources:
- https://scrapfly.io/blog/posts/how-to-bypass-imperva-incapsula-anti-scraping (retrieved full article, modified 14 October 2026)
- https://crawlee.dev/js/docs/guides/avoid-blocking
- https://docs.apify.com/proxy/unblocker
- https://playwright.dev/docs/browsers

The prior screenshot proves Error 15, not its root cause. Browser responses and cookies alone do not prove successful access. The current experiment uses branded Chrome in a virtual display, Crawlee BrowserPool's supported browser fingerprint handling, one residential session, one page, and no retries. It adds failed-stage and frame diagnostics. This is a tested implementation hypothesis, not a guarantee.

Scrapfly identifies IP reputation, transport and browser signals, cookies, and behavior as relevant. Its own examples include failed access with several open-source clients. A managed service is a separate option requiring a target-specific test. Apify Unblocker has no sticky sessions, so it should not be assumed compatible with session-sensitive search or detail links.

Success criterion: real business cards parsed with valid source identities. A homepage, cookie, HTTP 200, or absent error string is insufficient. Stop after a blocked experiment and review diagnostic evidence before spending on another configuration.

## Follow-up experiments

The Chrome/Crawlee configuration passed local compilation, lint, and schema checks and was deployed in build 0.0.28. Its live probe reached the homepage and submitted the Cambridge form, then failed on search results with Imperva Error 15 after 41 attempted requests. This narrows the failure to the results route; it does not identify the Imperva rule responsible.

Build 0.0.29 added experimental Apify UNBLOCKER selection without a sticky session. That probe stopped on Chrome's certificate warning, NET::ERR_CERT_AUTHORITY_INVALID, before source access could be assessed. TLS validation remained enabled. This is an integration failure, not evidence that the Unblocker service cannot reach Gas Safe.

No further paid attempts were started. ACCESS_TEST_RESULTS.json contains itemized reported charges. The additional local error-classification fix passed build, lint, and eight tests, but was not deployed to avoid another unnecessary build. A supported certificate trust setup or managed API integration is required before another Unblocker experiment; do not simply disable TLS checks.

## Pending certificate exception test

The managed Web Fetch call was rejected before execution with public-actor-disabled: this Creator account cannot run public Actors. No run ID was created and no charge was incurred.

No documented official Apify CA certificate was found in the checked public documentation. A local optional allowUnblockerCertificateException setting has been prepared, default false. It enables Playwright ignoreHTTPSErrors only in a disposable browser context, only with live Unblocker input. In this mode a route guard rejects requests outside HTTPS on gassaferegister.co.uk and www.gassaferegister.co.uk on the default port. This does not authenticate the interception proxy's certificate and is an explicit security exception, not a production trust fix. No local or global certificate store is modified. It has not been enabled, deployed, or tested against the source.

Activation requires explicit user consent to this precise exception. A contemplated single test retains a 120-second platform timeout, 90-second browser timeout, 60-request ceiling, and no retries. Existing reported test spend remains approximately USD 0.062; there were no new cloud builds or runs in this follow-up.

## Included Creator grant confirmed; certificate and HTTP tests

The user supplied subscription text confirming USD 6 prepaid usage plus USD 500 additional usage for the first six months, no current excess usage, and expiration on 14 April 2027. The account's USD 1 monthly base field had omitted the separate grant. Budget checks now recognize the supplied grant in the first usage cycle and retain the existing monthly spending limit.

Build 0.0.30 tested the isolated browser certificate exception. The previous certificate rejection no longer appeared, but the homepage did not load into a usable browser document and the run failed. No successful source access was established.

Build 0.0.31 added an HTTP Unblocker profile. The fresh homepage response was HTTP 200 but contained an Imperva Request unsuccessful iframe with an incident ID. The actor detected the block and failed with zero records after one attempted source request. No search form submission was attempted because the homepage was blocked. This confirms that trusting the interception certificate alone does not resolve source access.

Local build, lint, 13 tests and schema checks passed. The full business/engineer scraper is still pending a verified access route. All runs were private, bounded, and stopped; no subscriptions, account limits, schedules, or external paid services were changed. CERTIFICATE_AND_HTTP_TEST_RESULTS.json records reported charges for this continuation.
