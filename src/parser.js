/**
 * Pure parsing and normalization functions for Gas Safe Register UK.
 * Adapted and enhanced from the tested Chrome extension parser.
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
            
            const engineersLink = card.querySelector('a[data-testid="vEngineers"]')?.getAttribute('href');
            const servicesLink = card.querySelector('a[data-testid="vServices"]')?.getAttribute('href');

            return {
                business_name,
                registration_number,
                telephone: contactVal(card.querySelector('[data-testid="telephone"]')),
                email: contactVal(card.querySelector('[data-testid="eMail"]')),
                address,
                out_of_hours_available: /out of hours available/i.test(field(card, 'outHoursavailable')),
                distance_miles: field(card, 'distanceMiles') || null,
                engineers_url: engineersLink ? new URL(engineersLink, document.baseURI).href : null,
                services_url: servicesLink ? new URL(servicesLink, document.baseURI).href : null,
            };
        }).filter(b => b.business_name && /^\d{1,10}$/.test(b.registration_number));

        // Pagination info
        const summary = field(document, 'closestDistanceForEngineerorBusiness') || field(document, 'closestDistanceBusiness');
        const match = summary.match(/Showing\s+(\d+)\s+to\s+(\d+)\s+of\s+(\d+)/i);
        const nextHref = document.querySelector('a[data-testid="pgNext"]')?.getAttribute('href');

        return {
            businesses,
            currentPage: Number(field(document, 'pgCurrent')) || 1,
            totalResults: match ? Number(match[3]) : null,
            nextPageUrl: nextHref ? new URL(nextHref, document.baseURI).href : null,
            location: document.querySelector('#MatchedLocation')?.value || document.querySelector('#postCodeTownlabel')?.value || '',
        };
    });
}

/**
 * Parses individual engineers from an engineer detail page.
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
                telephone,
                status: status.trim() || null,
                services,
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
 * Parses qualification tables from a services detail page.
 */
export async function parseServicesPage(page) {
    return await page.evaluate(() => {
        const text = n => n?.textContent?.replace(/\s+/g, ' ').trim() || '';
        const tables = [...document.querySelectorAll('.ServiceTypeTable')];
        const qualifications = [];

        for (const table of tables) {
            const serviceType = table.id.replace('Table', '');
            const rows = table.querySelectorAll('tbody tr.SafeBlackBackground');

            for (const row of rows) {
                const cells = [...row.children].filter(n => n.nodeName === 'TD');
                if (cells.length < 4) continue;

                qualifications.push({
                    name: text(cells[0]),
                    service_type: serviceType,
                    natural_gas: !!cells[1].querySelector('.fa-check'),
                    lpg: !!cells[2].querySelector('.fa-check'),
                    building_regulations: !!cells[3].querySelector('.fa-check'),
                });
            }
        }

        return { qualifications };
    });
}
