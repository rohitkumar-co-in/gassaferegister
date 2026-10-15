import { load } from 'cheerio';

export const BASE = 'https://www.gassaferegister.co.uk/';
const cleanText = (text: string) => text.replace(/\s+/g, ' ').trim();
export function officialUrl(value: string): string {
    const url = new URL(value, BASE);
    if (url.protocol !== 'https:' || !['www.gassaferegister.co.uk', 'gassaferegister.co.uk'].includes(url.hostname)
        || url.username || url.password || url.port) throw new Error('Unexpected source URL');
    return url.href;
}
export function parseBusinesses(html: string) {
    const $ = load(html);
    $('script,style,noscript,svg').remove();
    const visible = $.root().text().replace(/\s+/g, ' ');
    if (/access denied|blocked by our security service|request unsuccessful/i.test(visible)) throw new Error('SOURCE_BLOCKED');
    const field = (root: ReturnType<typeof $>, key: string) => root.find(`[data-testid="${key}"]`).first().text().replace(/\s+/g, ' ').trim();
    const link = (root: ReturnType<typeof $>, key: string) => {
        const href = root.find(`a[data-testid="${key}"]`).attr('href');
        return href ? officialUrl(href) : null;
    };
    const root = $.root();
    const summary = field(root, 'closestDistanceForEngineerorBusiness') || field(root, 'closestDistanceBusiness');
    const match = /Showing\s+(\d+)\s+to\s+(\d+)\s+of\s+(\d+)/i.exec(summary);
    let businesses = $('.buscard').toArray().map((element) => {
        const card = $(element);
        const address = Object.fromEntries([
            ['premise', 'premise'], ['street', 'street'], ['town', 'town'], ['county', 'county'], ['postcode', 'postCde'],
        ].map(([key, selector]) => [key!, field(card, selector!) || null]));
        const registration = field(card, 'registrationNumber');
        const name = field(card, 'businessName');
        if (!registration || !name) throw new Error('SOURCE_LAYOUT_CHANGED: missing business identity');
        return {
            business_name: name, registration_number: registration,
            telephone: field(card, 'telephone') || null, email: field(card, 'eMail') || null,
            address: { ...address, full_address: Object.values(address).filter(Boolean).join(', ') },
            out_of_hours_available: /out of hours available/i.test(field(card, 'outHoursavailable')),
            distance_miles: field(card, 'distanceMiles') || null,
            engineers_url: link(card, 'vEngineers'), services_url: link(card, 'vServices'),
        };
    });
    if (!businesses.length && field($.root(), 'registrationNumber')) {
        const registration = field($.root(), 'registrationNumber');
        const name = field($.root(), 'businessName') || field($.root(), 'tradingName') || cleanText($('h1.wrapOverflow').first().text());
        if (!name) throw new Error('SOURCE_LAYOUT_CHANGED: missing business identity');
        const address = Object.fromEntries([
            ['premise', 'premise'], ['street', 'street'], ['town', 'town'], ['county', 'county'], ['postcode', 'postCde'],
        ].map(([key, selector]) => [key!, field($.root(), selector!) || null]));
        const fullAddress = Object.values(address).filter(Boolean).join(', ');
        businesses = [{ business_name: name, registration_number: registration,
            telephone: field($.root(), 'telephone') || null, email: field($.root(), 'eMail') || null,
            address: { ...address, full_address: fullAddress },
            out_of_hours_available: /out of hours available/i.test(field($.root(), 'outHoursavailable')),
            distance_miles: null, engineers_url: link($.root(), 'vEngineers'), services_url: link($.root(), 'vServices') }];
    }
    const empty = !businesses.length && /no (?:registered )?(?:businesses|engineers|results|matches) (?:were )?found|no business (?:was )?found|Showing\s+0\s+to\s+0\s+of\s+0/i.test(visible);
    if (!businesses.length && !empty) throw new Error('UNRECOGNIZED_RESULTS: cannot confirm an empty result');
    let total = empty ? 0 : null;
    if (match) total = Number(match[3]);
    return { businesses, total_results: total, next_page_url: link(root, 'pgNext') };
}
