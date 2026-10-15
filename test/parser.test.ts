import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseBusinesses, officialUrl } from '../src/parser.js';
import { validateInput } from '../src/config.js';
const html = readFileSync(new URL('../fixtures/businesses.html', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../fixtures/business-profile.html', import.meta.url), 'utf8');
describe('data and budget safety', () => {
    it('preserves registration strings, source count and pagination', () => {
        const parsed = parseBusinesses(html);
        expect(parsed.businesses[0]?.registration_number).toBe('000001');
        expect(parsed.total_results).toBe(2);
        expect(parsed.next_page_url).toContain('Page=2');
    });
    it('parses a single business profile for registration-number lookup', () => {
        const parsed = parseBusinesses(profile);
        expect(parsed.businesses).toHaveLength(1);
        expect(parsed.businesses[0]).toMatchObject({ business_name: 'Synthetic Test Heating', registration_number: '000001',
            address: { town: 'Cambridge', postcode: 'CB1 1JY' }, engineers_url: 'https://www.gassaferegister.co.uk/businessengineers?test=1' });
    });
    it('never reads a global phone number as a business contact', () => {
        const parsed = parseBusinesses(html.replace('<span data-testid="telephone">01223 000000</span>', '')
            .replace('<body>', '<body><span data-testid="telephone">0800 408 5500</span>'));
        expect(parsed.businesses[0]?.telephone).toBeNull();
    });
    it('fails on denied and unexpected pages instead of returning zero results', () => {
        expect(() => parseBusinesses('<body>Access denied</body>')).toThrow('SOURCE_BLOCKED');
        expect(() => parseBusinesses('<body>Something changed</body>')).toThrow('UNRECOGNIZED');
    });
    it('rejects external and credential-bearing detail links', () => {
        expect(() => officialUrl('https://evil.example/')).toThrow();
        expect(() => officialUrl('https://secret@gassaferegister.co.uk/')).toThrow();
    });
    it('defaults to the public live configuration and rejects unlimited budgets', () => {
        expect(validateInput({}).mode).toBe('scrape');
        expect(validateInput({}).location).toBe('CB1 1JY');
        expect(validateInput({}).useUkResidentialProxy).toBe(true);
        expect(validateInput({}).maxPages).toBe(25);
        expect(validateInput({ maxResults: 50 })).toMatchObject({ maxResults: 50, maxPages: 25 });
        expect(validateInput({ maxResults: 50, maxPages: 2 })).toMatchObject({ maxResults: 50, maxPages: 2 });
        expect(validateInput({ operation: 'search_businesses_basic', location: 'Cambridge', include_engineers: 'true', max_pages: 3 }))
            .toMatchObject({ operation: 'searchBusinessesBasic', includeEngineers: false, maxPages: 3, maxResults: 30 });
        expect(validateInput({ operation: 'get_business_engineers', registration_number: '000001' }))
            .toMatchObject({ operation: 'getBusinessEngineers', registrationNumber: '000001', includeEngineers: true, maxResults: 1 });
        expect(validateInput({ maxNetworkRequests: 300 }).maxNetworkRequests).toBe(300);
        expect(() => validateInput({ maxRuntimeSeconds: 0 })).toThrow();
        expect(validateInput({ maxNetworkRequests: 1500, maxRuntimeSeconds: 600, maxTransferMegabytes: 25 })).toMatchObject({ maxNetworkRequests: 1500, maxRuntimeSeconds: 600, maxTransferMegabytes: 25 });
        expect(() => validateInput({ maxNetworkRequests: 5001 })).toThrow();
        expect(() => validateInput({ maxNetworkRequests: 10000 })).toThrow();
    });
});
