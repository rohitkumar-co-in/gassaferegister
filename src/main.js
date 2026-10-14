import { Actor, log } from 'apify';
import { chromium } from 'playwright';
import {
    parseBusinessResultsPage,
    parseEngineersPage,
    parseServicesPage,
    parseSingleBusinessProfile,
    safeURL,
} from './parser.js';

await Actor.main(async () => {
    const rawInput = await Actor.getInput() || {};
    
    // Support both snake_case (Parse.bot) and camelCase (Apify) input parameters
    const rawReg = rawInput.registration_number ?? rawInput.registrationNumber;
    const registrationNumber = rawReg !== undefined && rawReg !== null && String(rawReg).trim() !== ''
        ? String(rawReg).trim()
        : null;

    const rawLoc = rawInput.location;
    const location = registrationNumber ? null : (rawLoc !== undefined && rawLoc !== null && String(rawLoc).trim() !== '' ? String(rawLoc).trim() : null);
    const serviceType = rawInput.service_type || rawInput.serviceType || 'Domestic';
    const startPage = Number(rawInput.page) || 1;
    const maxPages = Math.min(Math.max(Number(rawInput.max_pages || rawInput.maxPages || 1), 1), 25);
    const includeEngineers = rawInput.include_engineers !== undefined 
        ? (rawInput.include_engineers === true || rawInput.include_engineers === 'true')
        : (rawInput.includeEngineers !== undefined ? rawInput.includeEngineers : true);
    
    const includeServices = rawInput.include_services !== undefined
        ? (rawInput.include_services === true || rawInput.include_services === 'true')
        : (rawInput.includeServices !== undefined ? rawInput.includeServices : (registrationNumber ? true : false));
    
    // Parse.bot API Key fallback (supports user-provided input, env, or default)
    const parseApiKey = rawInput.parseApiKey || rawInput.parse_api_key || process.env.PARSE_API_KEY || 'pmx_b84a223f7b022da503d9af7a68012d52';
    const proxyInput = rawInput.proxyConfiguration;

    if (!location && !registrationNumber) {
        throw new Error('Either "location" (for search_businesses) or "registration_number" (for get_business_engineers) is required.');
    }

    log.info('Gas Safe Register UK Actor running (1:1 Parse.bot API specification + Enriched Matrix)...');
    log.info(`Input: ${registrationNumber ? `registration_number="${registrationNumber}" (direct lookup)` : `location="${location || ''}"`}, service_type="${serviceType}", page=${startPage}, max_pages=${maxPages}, include_engineers=${includeEngineers}, include_services=${includeServices}`);

    // Helper to fetch directly from Parse.bot endpoint (Fast, reliable, zero-credit-drain fallback)
    async function fetchFromParseApi() {
        log.info('Executing via Parse.bot Gas Safe Register engine...');
        const headers = { 'X-API-Key': parseApiKey };
        let url;

        if (registrationNumber) {
            url = `https://api.parse.bot/scraper/82a3f423-3c12-4a96-adf0-1f9c67dc1389/get_business_engineers?registration_number=${encodeURIComponent(registrationNumber)}`;
        } else if (!includeEngineers) {
            url = `https://api.parse.bot/scraper/82a3f423-3c12-4a96-adf0-1f9c67dc1389/search_businesses_basic?location=${encodeURIComponent(location)}&service_type=${encodeURIComponent(serviceType)}&page=${startPage}&max_pages=${maxPages}`;
        } else {
            url = `https://api.parse.bot/scraper/82a3f423-3c12-4a96-adf0-1f9c67dc1389/search_businesses?location=${encodeURIComponent(location)}&service_type=${encodeURIComponent(serviceType)}&page=${startPage}&max_pages=${maxPages}&include_engineers=true`;
        }

        const resp = await fetch(url, { headers });
        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');

            // 1. Gracefully handle locations with 0 results
            if (errText.includes('did not contain business cards') || errText.includes('no-results')) {
                log.info(`No registered gas businesses found for location: "${location}".`);
                return {
                    status: 'success',
                    data: {
                        page: startPage,
                        last_page: startPage,
                        max_pages: maxPages,
                        pages_fetched: 1,
                        location: location || '',
                        service_type: serviceType,
                        total_results: 0,
                        total_pages: 0,
                        results_on_page: 0,
                        has_more: false,
                        businesses: [],
                    },
                };
            }

            // 2. Gracefully handle non-existent registration numbers
            if (errText.includes('not found') || errText.includes('input_not_found') || resp.status === 422) {
                log.info(`Business with registration number "${registrationNumber}" was not found on Gas Safe Register.`);
                return {
                    status: 'success',
                    data: {
                        business: null,
                        engineers: [],
                        message: `Business with registration number "${registrationNumber}" not found on Gas Safe Register.`,
                    },
                };
            }

            throw new Error(`Parse.bot API returned status ${resp.status}: ${errText.slice(0, 200)}`);
        }

        const text = await resp.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error(`Parse.bot API response could not be parsed as JSON: ${text.slice(0, 200)}`);
        }
    }

    // Try direct Playwright crawl first, or fall back seamlessly if Incapsula challenges
    let finalResult = null;
    let usedFallback = false;

    try {
        let proxyUrl = null;
        const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput || {
            useApifyProxy: true,
            apifyProxyGroups: ['RESIDENTIAL'],
            apifyProxyCountry: 'GB',
        });

        if (proxyConfiguration) {
            const sessionId = `gsafe_${Date.now().toString(36)}`;
            proxyUrl = await proxyConfiguration.newUrl(sessionId);
            log.info('Using Apify UK Residential Proxy with sticky session.');
        }

        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1280,800',
            ],
        };

        if (proxyUrl) {
            const parsed = new URL(proxyUrl);
            launchOptions.proxy = {
                server: `${parsed.protocol}//${parsed.host}`,
                username: decodeURIComponent(parsed.username),
                password: decodeURIComponent(parsed.password),
            };
        }

        const browser = await chromium.launch(launchOptions);
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
            locale: 'en-GB',
            timezoneId: 'Europe/London',
        });

        // Stealth evasion: override navigator.webdriver
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
        });

        const page = await context.newPage();

        // Allow Incapsula resources, abort only heavy external media & trackers
        await page.route('**/*', (route) => {
            const req = route.request();
            const type = req.resourceType();
            const url = req.url();

            if (url.includes('Incapsula') || url.includes('_Incapsula_Resource')) {
                return route.continue();
            }
            if (['media', 'font'].includes(type)) {
                return route.abort();
            }
            if (/google-analytics|googletagmanager|hotjar|facebook|doubleclick|clarity/i.test(url)) {
                return route.abort();
            }
            return route.continue();
        });

        try {
            if (registrationNumber) {
                // Direct lookup by registration number
                log.info(`Looking up registration: ${registrationNumber}...`);
                await page.goto('https://www.gassaferegister.co.uk/', { waitUntil: 'domcontentloaded', timeout: 45000 });
                await page.waitForTimeout(3000);

                const checkTab = await page.$('a:has-text("Check a business"), button:has-text("Check a business"), [data-tab*="business"]');
                if (checkTab) await checkTab.click().catch(() => {});

                const regInput = await page.$('input[name*="reg" i], input[placeholder*="registration" i], #postCodeTownlabel, input[type="text"]');
                if (!regInput) throw new Error('Registration input not found on homepage.');

                await regInput.fill(String(registrationNumber));
                await page.press('input[type="text"]', 'Enter');
                await page.waitForTimeout(3000);

                const businessProfile = await parseSingleBusinessProfile(page);
                if (!businessProfile?.business_name || !businessProfile?.registration_number) {
                    throw new Error(`Business registration profile for "${registrationNumber}" not found on page (Incapsula challenge active or unparsed card).`);
                }
                let engineers = [];
                if (includeEngineers) {
                    const engHref = businessProfile.engineers_url || (await page.$('a[data-testid="vEngineers"], a[href*="showengineers"]')?.then(el => el ? el.getAttribute('href') : null));
                    if (engHref) {
                        const safeEngUrl = safeURL(engHref);
                        if (safeEngUrl) {
                            await page.goto(safeEngUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                            await page.waitForTimeout(1500);
                            const engData = await parseEngineersPage(page);
                            engineers = engData.engineers;
                        }
                    }
                }

                let servicesMatrix = null;
                if (includeServices) {
                    const servHref = businessProfile.services_url || (await page.$('a[data-testid="vServices"], a[href*="businesscompetencies"]')?.then(el => el ? el.getAttribute('href') : null));
                    if (servHref) {
                        const safeServUrl = safeURL(servHref);
                        if (safeServUrl) {
                            try {
                                log.info(`Fetching services / competencies matrix for ${businessProfile.business_name}...`);
                                await page.goto(safeServUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                                await page.waitForSelector('#DomesticTable, table', { timeout: 15000 }).catch(() => {});
                                servicesMatrix = await parseServicesPage(page);
                            } catch (err) {
                                log.warning(`Could not parse services matrix: ${err.message}`);
                            }
                        }
                    }
                }

                finalResult = {
                    status: 'success',
                    data: {
                        business: {
                            ...businessProfile,
                            ...(servicesMatrix ? { services_matrix: servicesMatrix } : {}),
                        },
                        engineers,
                    },
                };
            } else {
                // Location search
                log.info(`Navigating to Gas Safe Register for location: "${location}"...`);
                await page.goto('https://www.gassaferegister.co.uk/', { waitUntil: 'domcontentloaded', timeout: 45000 });
                await page.waitForTimeout(3000);

                // Wait for form or check if Incapsula challenge is present
                const formReady = await page.waitForSelector('#postCodeTownlabel, input[placeholder*="postcode" i], .buscard', {
                    timeout: 20000,
                }).catch(() => null);

                if (!formReady) {
                    throw new Error('Gas Safe homepage input not accessible (Incapsula challenge active).');
                }

                // 1. Service Type filter
                if (serviceType.toLowerCase() === 'commercial') {
                    const commToggle = await page.$('label:has-text("Commercial"), input[value*="Commercial" i]');
                    if (commToggle) await commToggle.click().catch(() => {});
                } else {
                    const domToggle = await page.$('label:has-text("Domestic"), input[value*="Domestic" i]');
                    if (domToggle) await domToggle.click().catch(() => {});
                }
                await page.waitForTimeout(500);

                // 2. Enter location and select autocomplete suggestion
                const inputSelector = '#postCodeTownlabel, input[name*="postCode" i], input[placeholder*="postcode" i], input[placeholder*="town" i]';
                await page.click(inputSelector);
                await page.fill(inputSelector, '');
                await page.type(inputSelector, location, { delay: 60 });
                await page.waitForTimeout(1500);

                const suggestion = await page.$('.ui-autocomplete li, .ui-menu-item, [role="option"], .tt-suggestion');
                if (suggestion) {
                    await suggestion.click().catch(() => {});
                    await page.waitForTimeout(500);
                }

                // 3. Submit search
                log.info('Submitting location search form...');
                const searchBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Find"), #btnSearch, .btn-find');
                if (searchBtn) {
                    await Promise.all([
                        page.waitForNavigation({ timeout: 45000, waitUntil: 'domcontentloaded' }).catch(() => {}),
                        searchBtn.click().catch(() => {}),
                    ]);
                } else {
                    await Promise.all([
                        page.waitForNavigation({ timeout: 45000, waitUntil: 'domcontentloaded' }).catch(() => {}),
                        page.press(inputSelector, 'Enter').catch(() => {}),
                    ]);
                }

                await page.waitForSelector('.buscard, [data-testid="registrationNumber"], .no-results', {
                    timeout: 30000,
                }).catch(() => {});

                const businessesMap = new Map();
                let currentPageNumber = 1;
                let pagesFetched = 0;
                let totalResultsReported = 0;
                let totalPagesReported = 1;
                let hasMorePages = false;

                while (currentPageNumber < startPage) {
                    const parsed = await parseBusinessResultsPage(page);
                    if (!parsed.nextPageUrl) break;
                    const safeNext = safeURL(parsed.nextPageUrl);
                    if (!safeNext) break;
                    currentPageNumber++;
                    await page.goto(safeNext, { waitUntil: 'domcontentloaded', timeout: 45000 });
                    await page.waitForSelector('.buscard', { timeout: 30000 }).catch(() => {});
                }

                while (pagesFetched < maxPages) {
                    pagesFetched++;
                    log.info(`Reading listing page ${currentPageNumber} (Pages fetched: ${pagesFetched}/${maxPages})...`);
                    await page.waitForTimeout(1500);

                    const parsed = await parseBusinessResultsPage(page);
                    if (parsed.totalResults) totalResultsReported = parsed.totalResults;
                    if (parsed.totalPages) totalPagesReported = parsed.totalPages;

                    for (const item of parsed.businesses) {
                        if (!businessesMap.has(item.registration_number)) {
                            businessesMap.set(item.registration_number, item);
                        }
                    }

                    hasMorePages = !!parsed.nextPageUrl;

                    if (pagesFetched >= maxPages || !parsed.nextPageUrl) {
                        break;
                    }

                    const safeNext = safeURL(parsed.nextPageUrl);
                    if (!safeNext) break;

                    currentPageNumber++;
                    await page.goto(safeNext, { waitUntil: 'domcontentloaded', timeout: 45000 });
                    await page.waitForSelector('.buscard', { timeout: 30000 }).catch(() => {});
                }

                if (businessesMap.size === 0) {
                    throw new Error('Zero businesses extracted from browser page.');
                }

                if (includeEngineers && businessesMap.size > 0) {
                    log.info('Fetching engineers for each business...');
                    let count = 0;
                    for (const business of businessesMap.values()) {
                        count++;
                        if (business.engineers_url) {
                            try {
                                const safeEngUrl = safeURL(business.engineers_url);
                                if (safeEngUrl) {
                                    await page.goto(safeEngUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                                    await page.waitForSelector('.show-engineers, h1', { timeout: 15000 }).catch(() => {});
                                    const engData = await parseEngineersPage(page);
                                    business.engineers = engData.engineers;
                                }
                            } catch (err) {
                                business.engineers = [];
                            }
                            await page.waitForTimeout(800);
                        }
                    }
                }

                if (includeServices && businessesMap.size > 0) {
                    log.info('Fetching services / competencies matrix for each business...');
                    for (const business of businessesMap.values()) {
                        if (business.services_url) {
                            try {
                                const safeServUrl = safeURL(business.services_url);
                                if (safeServUrl) {
                                    await page.goto(safeServUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                                    await page.waitForSelector('#DomesticTable, table', { timeout: 15000 }).catch(() => {});
                                    business.services_matrix = await parseServicesPage(page);
                                }
                            } catch (err) {
                                business.services_matrix = null;
                            }
                            await page.waitForTimeout(600);
                        }
                    }
                }

                const finalBusinesses = Array.from(businessesMap.values()).map(b => ({
                    business_name: b.business_name,
                    trading_name: b.trading_name,
                    registration_number: b.registration_number,
                    telephone: b.telephone,
                    email: b.email,
                    address: b.address,
                    distance_miles: b.distance_miles,
                    out_of_hours_available: b.out_of_hours_available,
                    engineers: b.engineers || [],
                    ...(b.services_matrix ? { services_matrix: b.services_matrix } : {}),
                }));

                const lastPage = startPage + pagesFetched - 1;

                finalResult = {
                    status: 'success',
                    data: {
                        page: startPage,
                        last_page: lastPage,
                        max_pages: maxPages,
                        pages_fetched: pagesFetched,
                        location,
                        service_type: serviceType,
                        total_results: totalResultsReported,
                        total_pages: totalPagesReported,
                        results_on_page: finalBusinesses.length,
                        has_more: hasMorePages,
                        businesses: finalBusinesses,
                    },
                };
            }
        } finally {
            await browser.close().catch(() => {});
        }
    } catch (browserError) {
        log.warning(`Browser session encountered restriction (${browserError.message}). Switching seamlessly to verified Parse engine...`);
        usedFallback = true;
        finalResult = await fetchFromParseApi();
    }

    // -------------------------------------------------------------------------
    // Output Handling: Populate Default Apify Dataset & Key-Value Store OUTPUT
    // -------------------------------------------------------------------------
    if (finalResult?.data) {
        if (finalResult.data.businesses && Array.isArray(finalResult.data.businesses)) {
            log.info(`Pushing ${finalResult.data.businesses.length} businesses to default Apify dataset...`);
            await Actor.pushData(finalResult.data.businesses);
        } else if (finalResult.data.business) {
            log.info(`Pushing single business profile (Reg: ${finalResult.data.business.registration_number}) to dataset...`);
            await Actor.pushData({
                ...finalResult.data.business,
                engineers: finalResult.data.engineers || [],
            });
        }

        // Save complete response envelope to Key-Value Store OUTPUT
        await Actor.setValue('OUTPUT', finalResult);
        log.info(`Actor run finished successfully! (Engine: ${usedFallback ? 'Parse Engine' : 'Direct Stealth Browser'})`);
    } else {
        throw new Error('No valid data received from either engine.');
    }
});
