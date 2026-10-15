# Imperva guide comparison and Gas Safe applicability

Reviewed 15 October 2026. This is a comparison of guidance, not a claim that every Google result or every possible technique was reviewed. Vendor success claims are not Gas Safe test results. No paid services or live Gas Safe tests were started in this research turn.

## Important new evidence from the supplied export

The seven-cookie JSON contains Hotjar analytics, journey, ASP.NET antiforgery, Azure affinity, an Umbraco/application cookie and survey state. It contains none of the common Imperva families reese84, ___utmvc, visid_incap_* or incap_ses_*. It also lacks a CookieConsent cookie.

Therefore the prior import_count=7 confirms a successful import, not replay of a valid Imperva clearance session or saved Cookiebot consent. This does not prove which cookies this particular deployment requires. It also does not identify the export's originating Chrome profile. Values were not printed or included in this report.

The earlier claim that cookies alone failed should be read narrowly: this particular export did not restore access. We did not establish that it contained the protection cookies from the successful Ban-profile search.

## The four user-provided guides

| Source | What it actually guides | Application to our Actor |
| --- | --- | --- |
| [ZenRows](https://www.zenrows.com/blog/incapsula-bypass) | Fortified browser automation including a SeleniumBase UC example; archives/caches; proxy or managed API options. | Browser-control differences are relevant. Cached pages do not meet the requirement for current registration/qualification data. Its API would introduce a separate service outside the current spending constraint. A successful example on Harvey Norman is not evidence for Gas Safe. |
| [ScrapeBadger](https://scrapebadger.com/blog/how-to-bypass-imperva-incapsula-anti-bot-protection-complete-2026-guide) | Compares clients on several hosts and distinguishes block pages, challenge pages, empty rendering and actual content. Highlights multiple protection vendors and token-refresh behavior. | Most useful for diagnostics: require actual business or engineer fields; do not count HTTP 200 or a cookie as success. Identify protection for the exact host and path. Its timing observations are specific to its tested targets, not universal Gas Safe expiry rules. |
| [IPRoyal](https://iproyal.com/blog/incapsula-bypass/) | Residential proxies, browser anti-detection, managed APIs, historical pages; its practical example calls ZenRows. Warns old cracking libraries are obsolete. | Adds no demonstrated free Gas Safe solution. Country selection alone does not establish a trusted session. Keep a stable session through a multi-step search rather than adopting per-request IP rotation mechanically. |
| [Diffy](https://docs.diffy.website/features/bypass-protection-cloudfront-akamai-incapsula/bypass-imperva-incapsula-protection) | Detect an Incapsula iframe, use Puppeteer stealth, perform interactions, wait for the iframe to disappear, and reload on retries. | Conditional challenge detection is relevant. The example has no immediate success return, so it reloads after logging clearance. Its published delays are fixed despite the surrounding random-delay description. Header examples contain apparent spelling errors. Fixed-coordinate clicks and typing arbitrary text are not appropriate to transplant into the Actor. A disappearing iframe alone is not business-data success. |

Diffy is not exclusively an owner-side allowlisting method: the linked page supplies client-side browser handling. That is what was evaluated here.

## Broader guides and implementation references

| Source | Guidance found | Assessment |
| --- | --- | --- |
| [Scrapfly](https://scrapfly.io/blog/posts/how-to-bypass-imperva-incapsula-anti-scraping/) | Compares real browsers and transport clients, session continuity, geographic consistency and browser-to-HTTP handoff. | Useful hypothesis map; none of its examples establishes Gas Safe access. |
| [Decodo](https://decodo.com/blog/imperva-bypass) | Browser transport, headers, proxies, JavaScript execution and managed infrastructure. | Similar layers to other guides; no target-specific fix. |
| [Roundproxies](https://roundproxies.com/blog/bypass-imperva-incapsula/) | Escalation from HTTP impersonation to browser tools, retries and pacing. | Readable via web extraction; direct local extraction was empty. Its example accepts content by a broad marker/length check, which should not replace our business-field validation. |
| [HProxy](https://hproxy.com/blog/how-to-scrape-past-imperva) | Explains why proxy quality alone does not address JavaScript and transport differences. | Relevant to the persistent block after changing proxy sessions. Broad claims still require controlled validation. |
| [DISASM](https://disasm.dev/blog/how-to-bypass-reese84/) | Outsources sensor-payload generation to its solver and reuses the returned cookie with matching client characteristics. | A separate service, not a free snippet. Not invoked or purchased. |
| [Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright) | Playwright-compatible Chromium changes targeting Runtime.enable, Console.enable and launch-flag signals. | Most directly compatible untested browser alternative for the existing TypeScript Actor. These are maintainer-described changes, not a guarantee. Its compatibility limitations need local regression testing. |
| [SeleniumBase CDP](https://github.com/seleniumbase/SeleniumBase/blob/master/examples/cdp_mode/ReadMe.md) | Pure CDP or switching from UC to CDP; includes an Imperva-protected example. | A distinct control path worth a bounded proof of concept; Python dependency/runtime work makes it less direct than Patchright here. Merely calling a method CDP does not guarantee access. |
| [Nodriver](https://github.com/ultrafunkamsterdam/nodriver) | Direct Chrome control without Selenium/chromedriver and cookie/profile helpers. | Another separate hypothesis, not a reason to migrate the whole TypeScript project immediately. |
| [Camoufox](https://camoufox.com/python/geoip/) | Geographic/browser alignment from proxy IP. | Our explicit geoip:false remains an untested configuration choice; locale alone is not equivalent. |
| [curl_cffi](https://curl-cffi.readthedocs.io/en/v0.11.2/impersonate.html) | Browser transport impersonation without a JavaScript browser runtime. | Potential later optimization after clearance; not sufficient by itself for the script flow we observed. |
| [Wafer](https://github.com/Averyy/wafer) | Target-specific transport fallbacks and browser solving under other conditions. | Demonstrates why one transport rule should not be generalized to every Imperva site. No Gas Safe result established. |
| [zendriver-imperva](https://docs.rs/zendriver-imperva/latest/zendriver_imperva/index.html) | Distinguishes token acquisition from accepted subsequent navigation. | Supports validating real results after clearance rather than treating a cookie as proof. |
| [2Captcha](https://2captcha.com/api-docs/imperva-incapsula), [CapMonster](https://docs.capmonster.cloud/docs/captchas/incapsula/) | External services returning protection cookies for an integration. | Separate service dependencies. Not used; existing spending constraint excludes introducing these silently. |
| [Historical cookie-overflow disclosure](https://blakeellis.dev/blog/Incapsula-Cookie-Overflow-Bypass) | Describes a vulnerability its author explicitly says is already patched. | Excluded from the plan; not a current solution. |

## What changes in the next experiment

1. Check a fresh export from the exact working Ban Chrome results tab before any paid test. Compare cookie names, domain/path, expiry and security attributes privately. Do not assume that an export from another profile or homepage carries the working security session.
2. Capture a sanitized successful-search HAR if possible. The connected extension cannot export it directly. This provides the missing successful request sequence; keep any token/form data private.
3. Verify one Apify GB residential session's actual route and continuity before source navigation. Do not claim that new session IDs prove different exit IPs.
4. Compare standard Playwright with Patchright while holding browser version, input, assets, cookie policy and proxy session as constant as practical. Record residual confounders; do not label a new-IP result a driver-only result.
5. Evaluate Camoufox geographic alignment separately, not as part of the same multi-change experiment.
6. Treat transient challenge waiting separately from terminal refusals. Use bounded waits, explicit document status checks, block-text detection and required business/engineer selectors. Do not add an unconditional retry loop or silently expand cost limits.

The latest observed source failure remains a homepage 403 after security script activity and before typing. There is still no verified fresh-cloud Gas Safe dataset. The private cloud Actor remains build 0.0.41; local diagnostics are newer. Reading articles did not change deployment or billing settings.
