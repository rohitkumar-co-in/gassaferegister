import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseBusinesses, officialUrl } from '../src/parser.js';
import { validateInput } from '../src/config.js';
const html = readFileSync(new URL('../fixtures/businesses.html', import.meta.url), 'utf8');
describe('data and budget safety', () => {
    it('preserves registration strings, source count and pagination', () => {
        const parsed = parseBusinesses(html);
        expect(parsed.businesses[0]?.registration_number).toBe('000001');
        expect(parsed.total_results).toBe(2);
        expect(parsed.next_page_url).toContain('Page=2');
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
    it('defaults to offline and rejects unlimited budgets', () => {
        expect(validateInput({}).mode).toBe('offlineTest');
        expect(validateInput({}).location).toBe('CB1 1JY');
        expect(validateInput({}).useUkResidentialProxy).toBe(false);
        expect(validateInput({ maxNetworkRequests: 300 }).maxNetworkRequests).toBe(300);
        expect(() => validateInput({ maxRuntimeSeconds: 0 })).toThrow();
        expect(() => validateInput({ maxNetworkRequests: 301 })).toThrow();
        expect(() => validateInput({ maxNetworkRequests: 10000 })).toThrow();
    });
});
