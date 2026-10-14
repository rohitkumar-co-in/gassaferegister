import { Actor, log } from 'apify';
import { chromium } from 'playwright';
import {
    cleanPhone,
    parseBusinessResultsPage,
    parseEngineersPage,
    parseServicesPage,
    safeURL,
} from './parser.js';

await Actor.init();

try {
    const input = await Actor.getInput() || {};
    const {
        location = 'Leeds',
        serviceType = 'Domestic',
        maxPages = 2,
        includeEngineers = true,
        engineerPagesPerBusiness = 2,
        proxyConfiguration: proxyInput,
    } = input;

    if (!location || !location.trim()) {
        throw new Error('Input parameter "location" is required. Please provide a UK city or postcode.');
    }

    const cleanLocation = location.trim();
    log.info(`Starting Gas Safe Register UK Scraper for location: "${cleanLocation}", serviceType: "${serviceType}"`);
    log.info(`Cost-saving limits: maxPages=${maxPages}, includeEngineers=${includeEngineers}, engineerPagesPerBusiness=${engineerPagesPerBusiness}`);

    // Build Apify Proxy with UK Residential IP
    let proxyUrl = null;
    const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput || {
        useApifyProxy: true,
        apifyProxyGroups: ['RESIDENTIAL'],
        apifyProxyCountry: 'GB',
    });

    if (proxyConfiguration) {
        // Use a sticky session ID so Incapsula cookies stay tied to the same UK IP throughout the crawl
        const sessionId = `gas_safe_${Date.now().toString(36)}`;
        proxyUrl = await proxyConfiguration.newUrl(sessionId);
        log.info('Using Apify UK Residential Proxy with sticky session for Incapsula bypass.');
    } else {
        log.warning('No proxy configuration provided. Running with direct connection (may be blocked outside UK).');
    }

    // Launch Chromium with anti-bot stealth flags
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

    // COST & SPEED OPTIMIZATION:
    // Block unnecessary media, fonts, tracking scripts, and analytics to minimize residential proxy data transfer
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

    log.info('Navigating to Gas Safe Register homepage...');
    await page.goto('https://www.gassaferegister.co.uk/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });

    // Wait for Incapsula challenge to pass if triggered
    await page.waitForTimeout(3000);

    // If an Incapsula iframe / challenge is displayed, wait for resolution
    const challengeIframe = await page.$('#main-iframe, iframe[src*="_Incapsula_Resource"]');
    if (challengeIframe) {
        log.info('Imperva Incapsula challenge detected. Waiting for automated resolution...');
        await page.waitForSelector('#postCodeTownlabel, input[placeholder*="postcode" i], .buscard', {
            timeout: 30000,
        }).catch(() => {});
    }

    // Accept cookie banners if present
    const cookieBtn = await page.$('#onetrust-accept-btn-handler, button:has-text("Accept All"), button:has-text("Accept Cookies")');
    if (cookieBtn) {
        await cookieBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
    }

    // Locate the search input
    log.info(`Searching for location: "${cleanLocation}"...`);
    const inputSelector = '#postCodeTownlabel, input[name*="postCode" i], input[placeholder*="postcode" i], input[placeholder*="town" i]';
    await page.waitForSelector(inputSelector, { timeout: 30000 });
    await page.fill(inputSelector, cleanLocation);
    await page.waitForTimeout(500);

    // Handle Service Type (Domestic / Commercial)
    if (serviceType.toLowerCase() === 'commercial') {
        const commercialToggle = await page.$('label:has-text("Commercial"), input[value*="Commercial" i]');
        if (commercialToggle) {
            await commercialToggle.click().catch(() => {});
            await page.waitForTimeout(500);
        }
    } else {
        const domesticToggle = await page.$('label:has-text("Domestic"), input[value*="Domestic" i]');
        if (domesticToggle) {
            await domesticToggle.click().catch(() => {});
            await page.waitForTimeout(500);
        }
    }

    // Submit search
    log.info('Submitting search form...');
    const searchBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Find"), #btnSearch');
    if (searchBtn) {
        await searchBtn.click();
    } else {
        await page.press(inputSelector, 'Enter');
    }

    // Wait for search results
    await page.waitForSelector('.buscard, [data-testid="registrationNumber"], .no-results', {
        timeout: 45000,
    }).catch(() => {});

    // Dictionary to hold collected businesses
    const businessesMap = new Map();
    let pagesScraped = 0;

    // Crawl business result pages
    while (pagesScraped < maxPages) {
        pagesScraped++;
        log.info(`Scraping business results page ${pagesScraped}/${maxPages}...`);

        await page.waitForTimeout(1500);
        const parsedResults = await parseBusinessResultsPage(page);

        log.info(`Found ${parsedResults.businesses.length} businesses on page ${parsedResults.currentPage}. (Total reported: ${parsedResults.totalResults || 'N/A'})`);

        for (const item of parsedResults.businesses) {
            if (!businessesMap.has(item.registration_number)) {
                businessesMap.set(item.registration_number, {
                    ...item,
                    engineers: [],
                    qualifications: [],
                    engineers_fetched: false,
                    qualifications_fetched: false,
                });
            }
        }

        if (pagesScraped >= maxPages || !parsedResults.nextPageUrl) {
            if (!parsedResults.nextPageUrl) {
                log.info('No further result pages available.');
            }
            break;
        }

        // Navigate to next page
        const safeNext = safeURL(parsedResults.nextPageUrl);
        if (!safeNext) break;

        log.info(`Navigating to next page: ${safeNext}`);
        await page.goto(safeNext, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('.buscard', { timeout: 30000 }).catch(() => {});
    }

    log.info(`Completed business listing collection. Total unique businesses collected: ${businessesMap.size}`);

    // Detail enrichment: Engineers and Qualifications (if enabled)
    if (includeEngineers && businessesMap.size > 0) {
        log.info('Starting detail enrichment (Engineers & Qualifications)...');
        let detailCount = 0;
        const totalToEnrich = businessesMap.size;

        for (const business of businessesMap.values()) {
            detailCount++;
            log.info(`[${detailCount}/${totalToEnrich}] Enriching details for: "${business.business_name}" (Reg: ${business.registration_number})`);

            // 1. Fetch Engineers
            if (business.engineers_url) {
                let engineerPage = 1;
                let nextEngUrl = safeURL(business.engineers_url);

                while (nextEngUrl && engineerPage <= engineerPagesPerBusiness) {
                    try {
                        await page.goto(nextEngUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await page.waitForSelector('.show-engineers, h1', { timeout: 15000 }).catch(() => {});

                        const engData = await parseEngineersPage(page);
                        for (const eng of engData.engineers) {
                            // Deduplicate engineers by name + telephone
                            const exists = business.engineers.some(e => e.name === eng.name && e.telephone === eng.telephone);
                            if (!exists) {
                                business.engineers.push(eng);
                            }
                        }

                        business.engineers_fetched = true;

                        if (engData.nextPageUrl && engineerPage < engineerPagesPerBusiness) {
                            engineerPage++;
                            nextEngUrl = safeURL(engData.nextPageUrl);
                            await page.waitForTimeout(1000);
                        } else {
                            nextEngUrl = null;
                        }
                    } catch (err) {
                        log.warning(`Failed to fetch engineers for ${business.business_name}: ${err.message}`);
                        break;
                    }
                }
            }

            // 2. Fetch Qualifications / Services
            if (business.services_url) {
                try {
                    const safeServUrl = safeURL(business.services_url);
                    if (safeServUrl) {
                        await page.goto(safeServUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await page.waitForSelector('.ServiceTypeTable, h1', { timeout: 15000 }).catch(() => {});

                        const servData = await parseServicesPage(page);
                        business.qualifications = servData.qualifications;
                        business.qualifications_fetched = true;
                    }
                } catch (err) {
                    log.warning(`Failed to fetch qualifications for ${business.business_name}: ${err.message}`);
                }
            }

            // Polite delay between businesses to prevent rate limiting
            await page.waitForTimeout(1000);
        }
    }

    await browser.close();

    // Format & push dataset items
    const records = [];
    const timestamp = new Date().toISOString();

    for (const b of businessesMap.values()) {
        const item = {
            business_name: b.business_name,
            registration_number: b.registration_number,
            telephone: b.telephone,
            telephone_normalized: cleanPhone(b.telephone),
            email: b.email,
            address: b.address,
            postcode: b.address?.postcode || null,
            out_of_hours_available: b.out_of_hours_available,
            distance_miles: b.distance_miles,
            search_location: cleanLocation,
            service_type: serviceType,
            collected_at: timestamp,
            engineers_total_collected: b.engineers.length,
            engineers: b.engineers,
            qualifications: b.qualifications,
        };
        records.push(item);
    }

    if (records.length > 0) {
        log.info(`Pushing ${records.length} records to Apify dataset...`);
        await Actor.pushData(records);
    } else {
        log.warning(`No business records found for location: "${cleanLocation}". Please verify the city or postcode.`);
    }

    // Save summary statistics to Key-Value Store
    await Actor.setValue('OUTPUT', {
        status: 'success',
        location: cleanLocation,
        serviceType,
        businessesFound: records.length,
        pagesScraped,
        completedAt: timestamp,
    });

    log.info(`Scraper completed successfully! Total businesses scraped: ${records.length}`);
} catch (error) {
    log.error(`Actor execution failed: ${error.message}`, { stack: error.stack });
    throw error;
} finally {
    await Actor.exit();
}
