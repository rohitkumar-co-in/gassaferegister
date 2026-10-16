import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { validateInput } from '../src/config.js';
import { crawl } from '../src/crawler.js';
import { businessDisplay, renderReport, resultTables, tableCsv } from '../src/presentation.js';

it('sizes GUI resource ceilings above the measured 20-business workload while honoring explicit caps', () => {
    const input = validateInput({ maxResults: 20 });
    expect(input.maxRuntimeSeconds).toBeGreaterThan(618);
    expect(input.maxNetworkRequests).toBeGreaterThan(2122);
    expect(input.maxTransferMegabytes).toBeGreaterThan(58);
    expect(validateInput({ maxResults: 20, maxRuntimeSeconds: 60 }).maxRuntimeSeconds).toBe(60);
    const schema = JSON.parse(readFileSync(new URL('../.actor/input_schema.json', import.meta.url), 'utf8'));
    const guiInput = Object.fromEntries(Object.entries(schema.properties).filter(([, p]) => (p as {default?: unknown}).default !== undefined)
        .map(([k, p]) => [k, (p as {default: unknown}).default]));
    expect(validateInput(guiInput)).toEqual(validateInput({}));
    expect(validateInput({ includeEngineers: false }).includeQualifications).toBe(false);
});

it('produces distinct readable engineer and qualification rows and escapes untrusted cells', async () => {
    const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
    const result = await crawl({
        async search() { return { html: fixture('businesses.html'), url: 'https://www.gassaferegister.co.uk/findbusinessresults' }; },
        async visit(url) { return { html: fixture(url.includes('engineerabcompetencies') ? 'qualifications.html' : 'engineers.html'), url }; },
    }, validateInput({ maxResults: 1, mode: 'offlineTest' }), { async record() {}, async progress() {} });
    const record = result.records[0]!;
    expect(businessDisplay(record).engineer_count).toBe(record.engineers.length);
    const tables = resultTables([record]);
    expect(tables.engineers.length).toBe(record.engineers.length);
    expect(tables.qualifications.length).toBe(record.qualifications.length);
    expect(tables.qualifications[0]).toHaveProperty('Natural gas');
    record.business_name = '<script>alert(1)</script>';
    expect(renderReport([record], 'partial', 'SOURCE_BLOCKED')).not.toContain('<script>');
    expect(renderReport([record], 'partial', 'SOURCE_BLOCKED')).toContain('SOURCE_BLOCKED');
    expect(tableCsv([{Name:'=HYPERLINK("bad")'}])).toContain("'=HYPERLINK");
});

it('retries one stalled search but does not retry an access denial', async () => {
    const html = readFileSync(new URL('../fixtures/businesses.html', import.meta.url), 'utf8');
    for (const code of ['SOURCE_SEARCH_DID_NOT_RETURN_RESULTS', 'SOURCE_BLOCKED']) {
        let attempts = 0;
        const result = await crawl({ async search() {
            attempts++;
            if (attempts === 1) throw new Error(code);
            return {html, url:'https://www.gassaferegister.co.uk/findbusinessresults'};
        }, async visit() { throw new Error('Unexpected detail request'); } }, validateInput({maxResults:1, includeEngineers:false}),
        {async record() {}, async progress() {}});
        expect(attempts).toBe(code === 'SOURCE_BLOCKED' ? 1 : 2);
        expect(result.records.length).toBe(code === 'SOURCE_BLOCKED' ? 0 : 1);
    }
});
