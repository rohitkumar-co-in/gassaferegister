# Imperva/Incapsula research and experiment priorities

Research date: 15 October 2026. No new source requests, paid services, subscriptions, cloud builds or cloud runs were started for this research.

## Observed failure

An isolated visible Windows Chrome test using Apify GB residential proxy, seven imported cookies and full assets received a homepage document 200, executed security script traffic, then received homepage 403 before the search field appeared. This is an access failure before search behavior. The existing local Ban Chrome profile completed a normal postcode search, but its network route was not measured. These are different environments, not a controlled same-profile A/B result.

## Documented approach families

| Approach | Evidence/source | Relevance and limits |
| --- | --- | --- |
| Residential proxy with session continuity | Apify residential proxy documentation | Already configured within each job. New sticky session IDs do not prove distinct or reputable exit IPs. Verify actual route and continuity privately before drawing conclusions about a proxy pool. |
| Browser environment aligned with proxy geography | Camoufox GeoIP documentation | Our code explicitly sets geoip:false. GeoIP alignment is an untested candidate, not a diagnosed root cause. Locale alone does not configure every geographic signal. |
| Browser startup and control method | Nodriver project; SeleniumBase CDP documentation | Alternative Chrome control paths are materially different experiments from rerunning the existing Playwright launcher. Their claims do not prove access to Gas Safe. Preserve certificate validation, sandboxing and normal site controls. |
| Browser/session persistence | Existing working-profile observation; browser-context design | Our Chrome launcher creates a new temporary profile every run; Camoufox creates a new context. Cookie import does not reproduce the whole existing profile. Persistence only helps retain a valid session once established. |
| Full browser execution | Current local full-assets trace | Already tested: JavaScript executed and the homepage still became 403. More scripts or longer sleeps are not established fixes. |
| TLS/HTTP impersonation for HTTP clients | curl_cffi documentation | Addresses transport signatures; plain curl_cffi has no browser JavaScript runtime. It cannot by itself complete this observed script flow. Lower priority while no valid fresh source session exists. |
| Browser-to-HTTP handoff | Scrapfly article's cookie-transfer experiment | A possible efficiency experiment after establishing a working session. Cross-client/cross-IP reuse must be tested; it is not equivalent to browser access. |
| Pacing and natural interaction | Scrapfly article | Useful for sustained navigation, but irrelevant to explaining a rejection before any typing. Not the next experiment. |
| Managed unblockers/APIs | Apify Unblocker docs; Scrapfly product article | Separate infrastructure, no guarantee for this target. Apify Unblocker has no sticky-session parameter. Prior tests did not establish a working end-to-end source session. External paid services remain excluded by user constraint. |
| Interactive verification | Source response inspection | No actionable interactive CAPTCHA has been observed in the captured trace. Adding a solver is unsupported by the evidence. |
| Source-supported access | Operational alternative | Obtain a supported API/export or access arrangement if reliability cannot be established economically. Do not assume Parse's private implementation is reproducible from marketing descriptions. |

## Code findings

- geoip:false is explicit in src/browser.ts; timezoneId is not set on the Chrome context.
- Chrome profile directory is generated with mkdtemp on every session.
- Service workers are blocked; the successful local profile's worker state has not been measured.
- Existing proxy configuration requests GB and a sticky session within each run. Actual exit-IP continuity has not been independently recorded.
- Imported cookies are encrypted at runtime, but their originating Chrome profile/IP is not known from the JSON file.
- Current deployed build is 0.0.41. Local timing diagnostics and document-403 classification changes are newer and not deployed.

## Priority order

1. Obtain a sanitized HAR from a fresh successful normal search in the working Ban profile. Compare request sequence and document responses with the failed local trace. Do not print secret-bearing headers, queries or form values.
2. Verify the selected GB proxy session's route and continuity. Do not infer a different exit from a different session name.
3. Test geographic alignment as one controlled configuration change.
4. Test an alternative Chrome startup/control path as a separate hypothesis, retaining normal TLS/security protections and the same bounded source workflow. A TypeScript/CDP proof of concept can avoid migrating the Actor to Python merely to evaluate the control-path hypothesis.
5. Consider browser-to-HTTP handoff only after a working session exists.

No method is recorded as a successful Gas Safe cloud fix. A finite research review cannot establish every possible bypass or promise that a library works against the site's current policy.

## Sources

- Scrapfly, updated article: https://scrapfly.io/blog/posts/how-to-bypass-imperva-incapsula-anti-scraping/
- Imperva detection model: https://www.imperva.com/products/advanced-bot-protection-management/
- Apify residential proxy: https://docs.apify.com/proxy/residential-proxy
- Apify Unblocker: https://docs.apify.com/proxy/unblocker
- Camoufox GeoIP: https://camoufox.com/python/geoip/
- Nodriver source/documentation: https://github.com/ultrafunkamsterdam/nodriver
- curl_cffi transport/runtime limitations: https://curl-cffi.readthedocs.io/en/v0.11.2/impersonate.html
