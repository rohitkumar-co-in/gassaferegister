import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { validateInput } from '../src/config.js';
import { crawl, getRunStatus, selectTown, visitWithBoundedRetry, type SourceSession } from '../src/crawler.js';
import { assertSource, parseEngineers, parseQualifications } from '../src/details.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const source = (duplicate = false): SourceSession => ({
    async search() { return { html: fixture('businesses.html'), url: 'https://www.gassaferegister.co.uk/findbusinessresults?Page=1' }; },
    async visit(url) {
        let name = duplicate ? 'businesses.html' : 'businesses-page2.html';
        if (url.includes('businessengineers')) name = 'engineers.html';
        if (url.includes('engineerabcompetencies')) name = 'qualifications.html';
        return { html: fixture(name), url };
    },
});
describe('complete bounded workflow', () => {
    it('looks up one business by registration number and enriches its engineer record', async () => {
        const session: SourceSession = {
            async search() { throw new Error('Location search should not be used for direct lookup'); },
            async lookup(registrationNumber) {
                expect(registrationNumber).toBe('000001');
                return { html: fixture('business-profile.html'), url: 'https://www.gassaferegister.co.uk/findbusinessresults?registration=000001' };
            },
            async visit(url) {
                const name = url.includes('businessengineers') ? 'engineers.html' : 'qualifications.html';
                return { html: fixture(name), url };
            },
        };
        const result = await crawl(session, validateInput({ operation: 'get_business_engineers', registration_number: '000001' }), {
            async record() { /* In-memory test only. */ }, async progress() { /* In-memory test only. */ },
        });
        expect(result.records).toHaveLength(1);
        expect(result.records[0]).toMatchObject({ registration_number: '000001', business_name: 'Synthetic Test Heating' });
        expect(result.records[0]?.engineers[0]?.name).toBe('Synthetic Engineer');
    });
    it('retries a transient idempotent detail visit once and records the retry', async () => {
        let attempts = 0;
        let retries = 0;
        const base = source();
        const flaky = { ...base, async visit(url: string) {
            attempts++;
            if (attempts === 1) throw new Error('net::ERR_CONNECTION_RESET');
            return base.visit(url);
        } };
        const result = await visitWithBoundedRetry(flaky, 'https://www.gassaferegister.co.uk/businessengineers/1', () => retries++);
        expect(result.html).toContain('Engineer');
        expect(attempts).toBe(2);
        expect(retries).toBe(1);
    });
    it('does not retry source blocks', async () => {
        let attempts = 0;
        await expect(visitWithBoundedRetry({ ...source(), async visit() { attempts++; throw new Error('SOURCE_BLOCKED'); } }, 'https://www.gassaferegister.co.uk/x'))
            .rejects.toThrow('SOURCE_BLOCKED');
        expect(attempts).toBe(1);
    });
    it('treats a confirmed empty response as a successful run', () => {
        expect(getRunStatus([{ location: 'CB1 1JY', page: 1, last_page: 1, max_pages: 1, pages_fetched: 1,
            total_results: 0, total_pages: 0, has_more: false, unique_results: 0, duplicates_skipped: 0,
            pagination_exhausted: true, status: 'succeeded', error: null }], 0, null)).toBe('succeeded');
    });
    it('stops before enrichment when the run cannot charge for another result', async () => {
        let visits = 0;
        let pushed = 0;
        const base = source();
        const result = await crawl({ ...base, async visit(url: string) { visits++; return base.visit(url); } }, validateInput({}), {
            canCreateRecord: () => false,
            async record() { pushed++; },
            async progress() { /* No storage in unit tests. */ },
        });
        expect(result.fatal).toBe(true);
        expect(result.records).toHaveLength(0);
        expect(result.locations[0]?.error).toBe('USER_MAX_CHARGE_REACHED');
        expect(visits).toBe(0);
        expect(pushed).toBe(0);
        expect(getRunStatus(result.locations, 0, null)).toBe('failed');
    });
    it('stops subsequent locations when validation access is forbidden', async () => {
        let searches = 0;
        const result = await crawl({ ...source(), async search() { searches++; throw new Error('SOURCE_VALIDATION_HTTP_403'); } }, validateInput({ locations: ['Cambridge', 'London'] }), {
            async record() { /* No storage in unit tests. */ }, async progress() { /* No storage in unit tests. */ },
        });
        expect(searches).toBe(1);
        expect(result.records).toHaveLength(0);
        expect(result.fatal).toBe(true);
    });
    it('can continue after a location-specific not-found response', async () => {
        let searches = 0;
        const base = source();
        const result = await crawl({ ...base, async search(location, county) {
            searches++;
            if (searches === 1) throw new Error('SOURCE_LOCATION_NOT_FOUND');
            return base.search(location, county);
        } }, validateInput({ locations: ['Unknown', 'Cambridge'], includeEngineers: false }), {
            async record() { /* No storage in unit tests. */ }, async progress() { /* No storage in unit tests. */ },
        });
        expect(searches).toBe(2);
        expect(result.records).toHaveLength(2);
        expect(result.fatal).toBe(false);
    });
    it('walks pages and enriches records with engineer status and table flags', async () => {
        const pushed: string[] = [];
        const result = await crawl(source(), validateInput({ maxPages: 2 }), {
            async record(record) { pushed.push(record.registration_number); }, async progress() { /* No storage in unit tests. */ },
        });
        expect(pushed).toEqual(['000001', '000002']);
        expect(result.locations[0]?.pagination_exhausted).toBe(true);
        expect(result.records[0]?.engineers[0]?.status).toBe('Registered');
        expect(result.records[0]?.engineers[0]?.telephone).toBeNull();
        expect(result.records[0]?.qualifications[0]).toMatchObject({ natural_gas: true, lpg: false, building_regulations: null });
    });
    it('deduplicates randomized overlaps and stops at the page budget', async () => {
        const result = await crawl(source(true), validateInput({ maxPages: 2 }), {
            async record() { /* No storage in unit tests. */ }, async progress() { /* No storage in unit tests. */ },
        });
        expect(result.records).toHaveLength(1);
        expect(result.locations[0]?.duplicates_skipped).toBe(1);
        expect(result.locations[0]?.has_more).toBe(true);
    });
    it('preserves the business and marks enrichment failed when detail access is blocked', async () => {
        const base = source();
        const result = await crawl({ ...base, async visit(url) { return { html: '<body>Request unsuccessful</body>', url }; } }, validateInput({}), {
            async record() { /* No storage in unit tests. */ }, async progress() { /* No storage in unit tests. */ },
        });
        expect(result.records).toHaveLength(1);
        expect(result.records[0]?.enrichment_status).toBe('failed');
        expect(result.locations[0]?.status).toBe('partial');
        expect(result.fatal).toBe(true);
    });
    it('requires a county when matching towns differ and accepts duplicate identical place labels', () => {
        expect(() => selectTown(['Cambridge - CAMBRIDGESHIRE', 'Cambridge - GLOUCESTERSHIRE'], 'Cambridge', '')).toThrow('AMBIGUOUS');
        expect(selectTown(['Cambridge - CAMBRIDGESHIRE', 'Cambridge - CAMBRIDGESHIRE'], 'Cambridge', '')).toBe(0);
        expect(selectTown(['Cambridge - CAMBRIDGESHIRE', 'Cambridge - GLOUCESTERSHIRE'], 'Cambridge', 'Gloucestershire')).toBe(1);
    });
    it('accepts Town, County in the single public location field for ambiguous towns', () => {
        expect(validateInput({ location: ' London, Middlesex ' })).toMatchObject({ location: 'London', locationCounty: 'Middlesex' });
        expect(validateInput({ location: 'London', locationCounty: 'Middlesex' })).toMatchObject({ location: 'London', locationCounty: 'Middlesex' });
        expect(validateInput({ location: 'CB1 1JY' })).toMatchObject({ location: 'CB1 1JY', locationCounty: '' });
    });
    it('never evaluates injected button JavaScript and rejects off-site navigation targets', () => {
        const original = fixture('engineers.html');
        expect(() => parseEngineers(original.replace('/engineerabcompetencies/123?synthetic=1', 'https://evil.example/'))).toThrow();
        expect(parseEngineers(original.replace("window.location='/engineerabcompetencies/123?synthetic=1'", 'alert(1)')).engineers[0]?.qualifications_url).toBeNull();
        expect(() => parseQualifications('<html>Unexpected page</html>')).toThrow('UNRECOGNIZED');
    });
    it('detects the source bot challenge even when Imperva responds with HTTP 200', () => {
        expect(() => assertSource('<main>Pardon Our Interruption. Something about your browser made us think you were a bot.</main>'))
            .toThrow('SOURCE_BLOCKED');
    });
    it('marks requested qualifications unavailable when no detail link is supplied', async () => {
        const base = source();
        const result = await crawl({ ...base, async visit(url) {
            return { html: fixture('engineers.html').replace("window.location='/engineerabcompetencies/123?synthetic=1'", ''), url };
        } }, validateInput({ maxResults: 1 }), {
            async record() { /* No storage in unit tests. */ }, async progress() { /* No storage in unit tests. */ },
        });
        expect(result.records[0]?.engineers[0]?.qualifications_status).toBe('unavailable');
        expect(result.records[0]?.enrichment_status).toBe('partial');
    });
    it('skips already persisted registrations while enriching new ones', async () => {
        let visits = 0;
        const first = await crawl(source(), validateInput({ maxResults: 1 }), {
            async record() { /* No storage in unit tests. */ }, async progress() { /* No storage in unit tests. */ },
        });
        const base = source();
        const second = await crawl({ ...base, async visit(url) { visits++; return base.visit(url); } }, validateInput({ maxResults: 2 }), {
            existing: first.records,
            async record() { throw new Error('Duplicate dataset write'); }, async progress() { /* No storage in unit tests. */ },
        });
        expect(second.records).toHaveLength(1);
        // The persisted first business is skipped; the new second business is enriched.
        expect(visits).toBeGreaterThan(0);
        expect(second.locations[0]?.duplicates_skipped).toBe(1);
    });
});
