/**
 * Pure parsing and normalization functions for Gas Safe Register UK.
 * Exactly replicated to match the Parse.bot Gas Safe Register API specification.
 */

export function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

export function cleanPhone(value) {
    const raw = cleanContact(value);
    if (!raw) return null;
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0044')) digits = '0' + digits.slice(4);
    else if (digits.startsWith('44')) digits = '0' + digits.slice(2);
    return digits || null;
}

export function cleanContact(value) {
    const result = cleanText(value);
    if (!result || /^(?:[-–—.]|n\/?a|not available)$/i.test(result)) {
        return null;
    }
    return result;
}

export function safeURL(value, baseURL = 'https://www.gassaferegister.co.uk/') {
    if (!value || typeof value !== 'string') return null;
    try {
        const u = new URL(value, baseURL);
        if (u.protocol !== 'https:' || !['www.gassaferegister.co.uk', 'gassaferegister.co.uk'].includes(u.hostname)) {
            return null;
        }
        return u.href;
    } catch {
        return null;
    }
}

/**
 * Parses business cards from the business search results page.
 * Returns business objects matching Parse.bot's exact data contract.
 */
export async function parseBusinessResultsPage(page) {
    return await page.evaluate(() => {
        const text = n => n?.textContent?.replace(/\s+/g, ' ').trim() || '';
        const field = (root, key) => text(root.querySelector(`[data-testid="${key}"]`));
        const contactVal = val => {
            const s = text(val);
            return /^(?:[-–—.]|n\/?a|not available)$/i.test(s) ? null : (s || null);
        };

        const cards = [...document.querySelectorAll('.buscard')];
        const businesses = cards.map(card => {
            const address = {
                premise: field(card, 'premise') || null,
                street: field(card, 'street') || null,
                town: field(card, 'town') || null,
                county: field(card, 'county') || null,
                postcode: (field(card, 'postCde') || '').toUpperCase() || null,
            };
            address.full_address = Object.values(address).filter(Boolean).join(', ');

            const registration_number = field(card, 'registrationNumber');
            const business_name = field(card, 'businessName');
            const trading_name = field(card, 'tradingName') || null;
            
            const engineersLink = card.querySelector('a[data-testid="vEngineers"]')?.getAttribute('href');
            const servicesLink = card.querySelector('a[data-testid="vServices"]')?.getAttribute('href');

            return {
                business_name,
                trading_name,
                registration_number,
                telephone: contactVal(card.querySelector('[data-testid="telephone"]')),
                email: contactVal(card.querySelector('[data-testid="eMail"]')),
                address,
                distance_miles: field(card, 'distanceMiles') || '',
                out_of_hours_available: /out of hours available/i.test(field(card, 'outHoursavailable')),
                engineers_url: engineersLink ? new URL(engineersLink, document.baseURI).href : null,
                services_url: servicesLink ? new URL(servicesLink, document.baseURI).href : null,
                engineers: [],
            };
        }).filter(b => b.business_name && /^\d{1,10}$/.test(b.registration_number));

        // Pagination info
        const summary = field(document, 'closestDistanceForEngineerorBusiness') || field(document, 'closestDistanceBusiness');
        const match = summary.match(/Showing\s+(\d+)\s+to\s+(\d+)\s+of\s+(\d+)/i);
        const totalResults = match ? Number(match[3]) : null;
        const nextHref = document.querySelector('a[data-testid="pgNext"]')?.getAttribute('href');
        const currentPage = Number(field(document, 'pgCurrent')) || 1;

        return {
            businesses,
            currentPage,
            totalResults,
            totalPages: totalResults ? Math.ceil(totalResults / 10) : null,
            nextPageUrl: nextHref ? new URL(nextHref, document.baseURI).href : null,
            location: document.querySelector('#MatchedLocation')?.value || document.querySelector('#postCodeTownlabel')?.value || '',
        };
    });
}

/**
 * Parses individual engineers from an engineer detail page.
 * Returns array of engineers matching Parse.bot format: { name, services, telephone, status }.
 */
export async function parseEngineersPage(page) {
    return await page.evaluate(() => {
        const text = n => n?.textContent?.replace(/\s+/g, ' ').trim() || '';
        const field = (root, key) => text(root.querySelector(`[data-testid="${key}"]`));

        const engineerCards = [...document.querySelectorAll('.show-engineers')];
        const engineers = engineerCards.map(card => {
            const heading = [...card.querySelectorAll('h3, h4')].find(n => text(n) === 'Status');
            let status = '';
            for (let n = heading?.nextSibling; n && !['H3', 'H4'].includes(n.nodeName); n = n.nextSibling) {
                status += ' ' + text(n);
            }

            const rawTel = field(card, 'telephone');
            const telephone = (!rawTel || rawTel.toLowerCase() === 'n/a') ? null : rawTel;
            const services = [...card.querySelectorAll('[data-testid]')]
                .filter(n => n.dataset.testid && n.dataset.testid.includes('servicesProvided'))
                .map(text)
                .filter(Boolean);

            return {
                name: field(card, 'EngineerName'),
                services: services.length ? services : ['Domestic'],
                telephone,
                status: status.trim() || 'Registered',
            };
        }).filter(e => e.name);

        const nextHref = document.querySelector('a[data-testid="pgNext"]')?.getAttribute('href');
        const currentPg = Number(field(document, 'pgCurrent')) || 1;

        return {
            engineers,
            currentPage: currentPg,
            nextPageUrl: nextHref ? new URL(nextHref, document.baseURI).href : null,
        };
    });
}

/**
 * Parses single business profile when looked up by registration number.
 */
export async function parseSingleBusinessProfile(page) {
    return await page.evaluate(() => {
        const text = n => n?.textContent?.replace(/\s+/g, ' ').trim() || '';
        const field = (root, key) => text(root.querySelector(`[data-testid="${key}"]`));
        const contactVal = val => {
            const s = text(val);
            return /^(?:[-–—.]|n\/?a|not available)$/i.test(s) ? null : (s || null);
        };

        const businessName = field(document, 'businessName') || field(document, 'tradingName') || text(document.querySelector('h1.wrapOverflow'));
        const registrationNumber = field(document, 'registrationNumber');

        const address = {
            premise: field(document, 'premise') || null,
            street: field(document, 'street') || null,
            town: field(document, 'town') || null,
            county: field(document, 'county') || null,
            postcode: (field(document, 'postCde') || '').toUpperCase() || null,
        };
        address.full_address = Object.values(address).filter(Boolean).join(', ');

        return {
            business_name: businessName,
            trading_name: field(document, 'tradingName') || null,
            registration_number: registrationNumber,
            telephone: contactVal(document.querySelector('[data-testid="telephone"]')),
            email: contactVal(document.querySelector('[data-testid="eMail"]')),
            address,
            out_of_hours_available: /out of hours available/i.test(field(document, 'outHoursavailable')),
        };
    });
}
