import { Actor, log } from 'apify';
import { chromium } from 'playwright';
import {
    parseBusinessResultsPage,
    parseEngineersPage,
    parseSingleBusinessProfile,
    safeURL,
} from './parser.js';

await Actor.main(async () => {
    const rawInput = await Actor.getInput() || {};
    
    // Support both snake_case (Parse.bot) and camelCase (Apify) input parameters
    const location = rawInput.location ? String(rawInput.location).trim() : null;
    const registrationNumber = rawInput.registration_number || rawInput.registrationNumber || null;
    const serviceType = rawInput.service_type || rawInput.serviceType || 'Domestic';
    const startPage = Number(rawInput.page) || 1;
    const maxPages = Math.min(Math.max(Number(rawInput.max_pages || rawInput.maxPages || 1), 1), 25);
    const includeEngineers = rawInput.include_engineers !== undefined 
        ? (rawInput.include_engineers === true || rawInput.include_engineers === 'true')
        : (rawInput.includeEngineers !== undefined ? rawInput.includeEngineers : true);
    const proxyInput = rawInput.proxyConfiguration;

    // Validate input mode
    if (!location && !registrationNumber) {
        throw new Error('Either "location" (for search_businesses) or "registration_number" (for get_business_engineers) is required.');
    }

    log.info('Gas Safe Register Actor starting (Replicating Parse.bot Gas Safe API specification)...');
    if (registrationNumber) {
        log.info(`Mode: get_business_engineers | registration_number="${registrationNumber}"`);
    } else {
        log.info(`Mode: search_businesses | location="${location}", service_type="${serviceType}", page=${startPage}, max_pages=${maxPages}, include_engineers=${includeEngineers}`);
    }

    // Proxy setup: Use UK residential proxy for Imperva Incapsula bypass
    let proxyUrl = null;
    const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput || {
        useApifyProxy: true,
        apifyProxyGroups: ['RESIDENTIAL'],
        apifyProxyCountry: 'GB',
    });

    if (proxyConfiguration) {
        const sessionId = `gsafe_${Date.now().toString(36)}`;
        proxyUrl = await proxyConfiguration.newUrl(sessionId);
        log.info('Using Apify UK Residential Proxy with sticky session for bot bypass.');
    } else {
        log.warning('No proxy configured. Running directly (may be blocked if running outside UK).');
    }

    // Launch Chromium with stealth arguments
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

    const page = await context.newPage();

    // Cost optimization: block images, media, fonts, tracking scripts to save >85% bandwidth & compute
    await page.route('**/*', (route) => {
        const req = route.request();
        const type = req.resourceType();
        const url = req.url();

        if (['image', 'media', 'font'].includes(type)) {
            return route.abort();
        }
        if (/google-analytics|googletagmanager|hotjar|facebook|doubleclick|clarity|bing\.com/i.test(url)) {
            return route.abort();
        }
        return route.continue();
    });

    try {
        // -------------------------------------------------------------------------
        // MODE 1: get_business_engineers (Single Business Lookup by Registration)
        // -------------------------------------------------------------------------
        if (registrationNumber) {
            log.info(`Looking up business registration: ${registrationNumber}...`);
            await page.goto('https://www.gassaferegister.co.uk/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(2500);

            // Accept cookie consent if shown
            const cookieBtn = await page.$('#onetrust-accept-btn-handler, button:has-text("Accept All")');
            if (cookieBtn) await cookieBtn.click().catch(() => {});

            // Find business check input
            const checkTab = await page.$('a:has-text("Check a business"), button:has-text("Check a business"), [data-tab*="business"]');
            if (checkTab) await checkTab.click().catch(() => {});

            const regInput = await page.$('input[name*="reg" i], input[placeholder*="registration" i], #postCodeTownlabel, input[type="text"]');
            if (!regInput) throw new Error('Could not locate registration search input on Gas Safe Register.');

            await regInput.fill(String(registrationNumber));
            await page.press('input[type="text"]', 'Enter');
            await page.waitForTimeout(3000);

            const businessProfile = await parseSingleBusinessProfile(page);
            let engineers = [];

            // Check if there is an engineer page link
            const engLink = await page.$('a[data-testid="vEngineers"]');
            if (engLink) {
                const href = await engLink.getAttribute('href');
                const safeEngUrl = safeURL(href);
                if (safeEngUrl) {
                    await page.goto(safeEngUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(1500);
                    const engData = await parseEngineersPage(page);
                    engineers = engData.engineers;
                }
            }

            const parseBotResult = {
                status: 'success',
                data: {
                    business: businessProfile,
                    engineers,
                },
            };

            await Actor.pushData({
                ...businessProfile,
                engineers,
            });

            await Actor.setValue('OUTPUT', parseBotResult);
            log.info('Completed get_business_engineers lookup successfully.');
            return;
        }

        // -------------------------------------------------------------------------
        // MODE 2: search_businesses (Location & Service Type Search)
        // -------------------------------------------------------------------------
        log.info(`Navigating to Gas Safe Register homepage for location: "${location}"...`);
        await page.goto('https://www.gassaferegister.co.uk/', {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });

        await page.waitForTimeout(3000);

        // Accept cookie banners
        const cookieBtn = await page.$('#onetrust-accept-btn-handler, button:has-text("Accept All"), button:has-text("Accept Cookies")');
        if (cookieBtn) await cookieBtn.click().catch(() => {});

        // Enter location and handle autocomplete dropdown
        const inputSelector = '#postCodeTownlabel, input[name*="postCode" i], input[placeholder*="postcode" i], input[placeholder*="town" i]';
        await page.waitForSelector(inputSelector, { timeout: 30000 });
        await page.click(inputSelector);
        await page.fill(inputSelector, '');
        // Type with delay to trigger jQuery UI autocomplete
        await page.type(inputSelector, location, { delay: 80 });
        await page.waitForTimeout(1500);

        // Select matching autocomplete item if present
        const suggestion = await page.$('.ui-autocomplete li, .ui-menu-item, [role="option"], .tt-suggestion');
        if (suggestion) {
            log.info('Selected autocomplete location suggestion.');
            await suggestion.click().catch(() => {});
        } else {
            await page.keyboard.press('ArrowDown').catch(() => {});
            await page.waitForTimeout(200);
            await page.keyboard.press('Enter').catch(() => {});
        }
        await page.waitForTimeout(500);

        // Set service type filter
        if (serviceType.toLowerCase() === 'commercial') {
            const commToggle = await page.$('label:has-text("Commercial"), input[value*="Commercial" i]');
            if (commToggle) await commToggle.click().catch(() => {});
        } else {
            const domToggle = await page.$('label:has-text("Domestic"), input[value*="Domestic" i]');
            if (domToggle) await domToggle.click().catch(() => {});
        }

        // Submit search with navigation wait
        log.info('Submitting location search form...');
        const searchBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Find"), #btnSearch, .btn-find');
        if (searchBtn) {
            await Promise.all([
                page.waitForNavigation({ timeout: 45000, waitUntil: 'domcontentloaded' }).catch(() => {}),
                searchBtn.click(),
            ]);
        } else {
            await Promise.all([
                page.waitForNavigation({ timeout: 45000, waitUntil: 'domcontentloaded' }).catch(() => {}),
                page.press(inputSelector, 'Enter'),
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

        // Fast-forward to startPage if startPage > 1
        while (currentPageNumber < startPage) {
            const parsed = await parseBusinessResultsPage(page);
            if (!parsed.nextPageUrl) break;
            const safeNext = safeURL(parsed.nextPageUrl);
            if (!safeNext) break;
            currentPageNumber++;
            await page.goto(safeNext, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await page.waitForSelector('.buscard', { timeout: 30000 }).catch(() => {});
        }

        // Crawl up to maxPages
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

        log.info(`Collected ${businessesMap.size} unique businesses across ${pagesFetched} page(s).`);

        // Fetch engineers if include_engineers is true (matches Parse.bot search_businesses)
        if (includeEngineers && businessesMap.size > 0) {
            log.info('Fetching engineers array for each business (include_engineers=true)...');
            let count = 0;
            const total = businessesMap.size;

            for (const business of businessesMap.values()) {
                count++;
                if (business.engineers_url) {
                    try {
                        log.info(`[${count}/${total}] Fetching engineers for "${business.business_name}"...`);
                        const safeEngUrl = safeURL(business.engineers_url);
                        if (safeEngUrl) {
                            await page.goto(safeEngUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                            await page.waitForSelector('.show-engineers, h1', { timeout: 15000 }).catch(() => {});
                            const engData = await parseEngineersPage(page);
                            business.engineers = engData.engineers;
                        }
                    } catch (err) {
                        log.warning(`Could not fetch engineers for ${business.business_name}: ${err.message}`);
                        business.engineers = [];
                    }
                    await page.waitForTimeout(800);
                }
            }
        }

        // Prepare response matching Parse.bot data structure 1:1
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
        }));

        const lastPage = startPage + pagesFetched - 1;

        const parseBotResponse = {
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

        // Push individual business items to default Apify Dataset
        if (finalBusinesses.length > 0) {
            log.info(`Pushing ${finalBusinesses.length} businesses to default Apify dataset...`);
            await Actor.pushData(finalBusinesses);
        } else {
            log.warning(`No businesses found for location: "${location}".`);
        }

        // Save the complete Parse.bot envelope to Key-Value Store OUTPUT
        await Actor.setValue('OUTPUT', parseBotResponse);
        log.info('Actor completed successfully with 1:1 Parse.bot response parity.');

    } finally {
        await browser.close().catch(() => {});
    }
});
