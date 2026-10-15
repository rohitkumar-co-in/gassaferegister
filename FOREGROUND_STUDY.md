# Visible Chrome study — 15 October 2026

## Direct observations

- Initial connected browser inventory named Chrome profile Rohit (browser 3). That connection disappeared during the attempted interaction.
- Refreshed inventory exposed Chrome profile Ban (browser 4), with existing London results pages already open. Those pages are pre-existing evidence, not searches performed by this study.
- Opened a dedicated Gas Safe homepage tab in profile Ban without importing cookies or changing network settings.
- Clicked Postcode or Town, entered CB1 1JY using sequential keyboard events, clicked the normal Search button, and waited for the results navigation.
- Fresh search succeeded: 10 business cards, reported 50 results, closest-distance-first ordering. First business Refri-Gas Solutions Limited, registration 947637, distance 0.22 miles.
- No cookie-consent dialog was visible in this sequence. Consent dismissal was therefore not exercised in this successful run.
- Proof: experiment-results/foreground-postcode-success.png. Successful results tab left open.
- No Apify run/build started for this study.

## Comparison with Actor build 0.0.41

The cloud Chrome run imported seven cookies and was blocked on the homepage before typing. Camoufox imported seven cookies, completed /tpv validation (200), submitted /widgetfc (302), then received 403 at /findbusinessresults.

The Actor starts a new temporary Chrome profile each run (or a new Camoufox context), blocks service workers, uses a GB Apify residential proxy, and defaults to blocking images/media/fonts. The successful local browser uses an existing Windows Chrome profile. Its current egress country/provider was not measured and it was not configured to use Apify Proxy by this study.

The working normal button flow also differs from the validatedForm method used in the last cookie tests. Prior cloud normal-button Chrome tests were blocked before reaching the form, so that comparison remains confounded by access environment.

## Conclusions and limits

The live site search works in the existing Ban browser profile using ordinary UI controls. This does not establish that foreground status, typing speed, profile state, cookies, IP reputation, browser transport, or any particular browser signal caused the difference. Several variables changed together. The cookie export does not identify its originating Chrome profile, so its provenance cannot be inferred from seven imported cookies.

Typing speed cannot explain a homepage rejection occurring before any typing. Cookie import alone demonstrably did not restore cloud access. Both Actor headed modes already use headless:false; a cloud virtual display is a different environment from the local desktop.

The connected extension exposes DOM interaction and screenshots, but no cookie export, proxy configuration, or raw network-trace capability. Its read-only DOM evaluation does not support document.hasFocus(), so OS foreground focus was not independently measured. No unsupported browser APIs or system browser-profile extraction were used.

Imperva describes multi-layer detection including browser/client validation, behavioral analysis, connection characteristics and threat intelligence. This supports investigating multiple signals, not claiming this site's precise rule is known: https://www.imperva.com/products/advanced-bot-protection-management/

## Next controlled comparison

Keep the working Chrome profile and normal search flow fixed while changing only its network route to an explicitly configured GB Apify residential session. The connected extension cannot perform this proxy configuration. A separately configured isolated browser/profile and a redacted network trace would be needed to isolate that variable; merely adding random pauses or mouse movements would not establish causality. Do not alter the user's main profile proxy or copy its full profile as an implicit next step.
