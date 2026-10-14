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
 * Returns array of engineers matching Parse.bot format: { name, services, telephone, status }
 * plus enriched fields: { licence_number, photo_url, competencies_url }.
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

            // Photo URL & Licence Number
            const photoImg = card.querySelector('[data-testid="photoId"], [data-testid="photo"] img, img[alt*="Photograph"]');
            let photoUrl = photoImg?.getAttribute('src') || photoImg?.getAttribute('data-savepage-src') || null;
            let licenceNumber = null;
            if (photoUrl) {
                const licMatch = photoUrl.match(/\/(\d{5,10})(?:$|\?)/);
                if (licMatch) licenceNumber = licMatch[1];
                try {
                    photoUrl = new URL(photoUrl, document.baseURI).href;
                } catch {}
            }

            // Direct link to engineer competencies
            const compBtn = card.querySelector('button[onclick*="competencies"], a[href*="competencies"]');
            let competenciesUrl = null;
            if (compBtn) {
                const onclick = compBtn.getAttribute('onclick') || '';
                const match = onclick.match(/['"]([^'"]*competencies[^'"]*)['"]/);
                const rawUrl = match ? match[1] : compBtn.getAttribute('href');
                if (rawUrl) {
                    try {
                        competenciesUrl = new URL(rawUrl, document.baseURI).href;
                    } catch {}
                }
            }

            return {
                name: field(card, 'EngineerName'),
                licence_number: licenceNumber,
                services: services.length ? services : ['Domestic'],
                telephone,
                status: status.trim() || 'Registered',
                photo_url: photoUrl,
                competencies_url: competenciesUrl,
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
 * Parses full competencies and qualifications matrix from a services page.
 * Returns structured { domestic, commercial } arrays with Natural Gas, LPG, and Building Regs.
 */
export async function parseServicesPage(page) {
    return await page.evaluate(() => {
        const text = n => n?.textContent?.replace(/\s+/g, ' ').trim() || '';

        const parseTable = (tableEl) => {
            if (!tableEl) return [];
            const rows = [...tableEl.querySelectorAll('tbody tr, tr')];
            const items = [];
            for (let i = 0; i < rows.length; i++) {
                const cells = [...rows[i].querySelectorAll('td')];
                if (cells.length >= 4) {
                    const serviceName = text(cells[0]);
                    const hasNaturalGas = !!cells[1].querySelector('.fa-check');
                    const hasLpg = !!cells[2].querySelector('.fa-check');
                    const hasBuildingRegs = !!cells[3].querySelector('.fa-check');
                    if (serviceName) {
                        items.push({
                            service: serviceName,
                            natural_gas: hasNaturalGas,
                            lpg: hasLpg,
                            building_regulations: hasBuildingRegs,
                        });
                    }
                }
            }
            return items;
        };

        const domesticEl = document.querySelector('#DomesticTable table') || document.querySelector('#DomesticTable') || document.querySelectorAll('table')[0];
        const commercialEl = document.querySelector('#CommercialTable table') || document.querySelector('#CommercialTable') || document.querySelectorAll('table')[1];

        const domestic = parseTable(domesticEl);
        const commercial = parseTable(commercialEl);

        return {
            domestic,
            commercial,
            total_domestic: domestic.length,
            total_commercial: commercial.length,
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

        const engineersLink = document.querySelector('a[data-testid="vEngineers"], a[href*="showengineers"]')?.getAttribute('href');
        const servicesLink = document.querySelector('a[data-testid="vServices"], a[href*="businesscompetencies"]')?.getAttribute('href');

        return {
            business_name: businessName,
            trading_name: field(document, 'tradingName') || null,
            registration_number: registrationNumber,
            telephone: contactVal(document.querySelector('[data-testid="telephone"]')),
            email: contactVal(document.querySelector('[data-testid="eMail"]')),
            address,
            out_of_hours_available: /out of hours available/i.test(field(document, 'outHoursavailable')),
            engineers_url: engineersLink ? new URL(engineersLink, document.baseURI).href : null,
            services_url: servicesLink ? new URL(servicesLink, document.baseURI).href : null,
        };
    });
}
