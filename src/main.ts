import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { Actor, log } from 'apify';

import { type BrowserMetrics,createBrowserSession } from './browser.js';
import { type Input, validateInput } from './config.js';
import { type Business, crawl, getRunStatus, type LocationResult, type SourceSession } from './crawler.js';
import { classifyError } from './errors.js';
import { httpProbe } from './http-probe.js';

await Actor.init();
const metrics: BrowserMetrics = { network_requests: 0, transferred_bytes: 0, browser_user_agent: '', limit: null };
const summary = { status: 'starting', mode: '', business_count: 0, coverage: 'bounded_randomized_results',
    locations: [] as LocationResult[], error: null as string | null, retry_count: 0, ...metrics, started_at: new Date().toISOString() };
let session: Awaited<ReturnType<typeof createBrowserSession>> | undefined;
let records: Business[] = [];
let inputHash = '';
const persist = async () => {
    await Actor.setValue('RUN-SUMMARY', { ...summary, ...metrics, business_count: records.length, updated_at: new Date().toISOString() });
    if (inputHash) await Actor.setValue('STATE', { inputHash, updated_at: new Date().toISOString() });
};
Actor.on('aborting', async () => {
    summary.status = 'aborted';
    await persist();
    await session?.close();
    await Actor.exit();
});
try {
    const input = validateInput((await Actor.getInput<Input>()) ?? {});
    summary.mode = input.mode;
    const charging = Actor.getChargingManager();
    const itemEvent = 'apify-default-dataset-item';
    const pricing = charging.getPricingInfo();
    const isPaidResultEvent = pricing.isPayPerEvent && (pricing.perEventPrices[itemEvent] ?? 0) > 0;
    const canCreateRecord = () => !isPaidResultEvent || charging.calculateMaxEventChargeCountWithinLimit(itemEvent) > 0;
    // Fail before opening a browser or consuming proxy bandwidth when the user's run cap cannot cover one result.
    if (isPaidResultEvent && !canCreateRecord()) throw new Error('USER_MAX_CHARGE_REACHED: run limit cannot cover one business record');
    inputHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const state = await Actor.getValue<{ inputHash: string }>('STATE');
    if (state && state.inputHash !== inputHash) throw new Error('Invalid resume input: use a new run for different parameters');
    const dataset = await Actor.openDataset();
    // Dataset is the durable source of canonical records when a run is resurrected.
    if (state) {
        const existing = await dataset.getData({ limit: 1000 });
        records = existing.items as Business[];
    }
    summary.status = 'running';
    await persist();
    let source: SourceSession;
    if (input.mode === 'offlineTest') {
        const fixture = async (name: string) => readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
        source = {
            async search() { return { html: await fixture('businesses.html'), url: 'https://www.gassaferegister.co.uk/findbusinessresults?Page=1' }; },
            async visit(url) {
                const path = new URL(url).pathname;
                let name = 'businesses-page2.html';
                if (/businessengineers|showengineers/.test(path)) name = 'engineers.html';
                if (path.includes('engineerabcompetencies')) name = 'qualifications.html';
                return { html: await fixture(name), url };
            },
        };
    } else if (input.browserProfile === 'unblockerHttp') {
        if (input.mode === 'scrape') throw new Error('Invalid profile: HTTP is access diagnostics only; choose a browser for scraping');
        const config = await Actor.createProxyConfiguration({ groups: ['UNBLOCKER'], countryCode: input.proxyCountry === 'GB' ? 'GB' : undefined });
        const proxyUrl = await config?.newUrl();
        if (!proxyUrl) throw new Error('PROXY_CONFIGURATION_UNAVAILABLE');
        const result = await httpProbe({ location: input.location, serviceType: input.serviceType, proxyUrl,
            allowCertificateException: input.allowUnblockerCertificateException, maxRequests: input.maxNetworkRequests,
            runtimeSeconds: input.maxRuntimeSeconds, onRequest: () => { metrics.network_requests++; },
            onResponse: async (stage, body, statusCode) => { await Actor.setValue('HTTP-DIAGNOSTIC', { stage, statusCode, html: body.slice(0, 250000) }); },
        });
        input.includeEngineers = false;
        input.includeQualifications = false;
        input.maxPages = 1;
        input.page = 1;
        source = { async search() { return { html: result.html, url: result.sourceUrl }; }, async visit() { throw new Error('Invalid HTTP pagination'); } };
    } else {
        session = await createBrowserSession(input, metrics);
        source = session;
    }
    const result = await crawl(source, input, {
        existing: records,
        canCreateRecord,
        onRetry() { summary.retry_count++; },
        async record(record) {
            await Actor.pushData(record);
            records.push(record);
            await persist();
        },
        async progress(locations) { summary.locations = locations; await persist(); },
    });
    records = result.records;
    summary.status = getRunStatus(result.locations, records.length, metrics.limit);
    summary.error = metrics.limit ?? result.locations.find((location) => location.error)?.error ?? null;
    if (summary.status !== 'succeeded') await session?.diagnose().catch(() => { /* Diagnostics must not mask source failures. */ });
    await Actor.setValue('RESULTS', { status: summary.status, coverage: summary.coverage, locations: summary.locations,
        businesses: records, unique_businesses: records.length, source_order: 'randomized', completeness_guaranteed: false });
    log.info('Scrape finished', { status: summary.status, businesses: records.length, requests: metrics.network_requests });
} catch (error) {
    summary.status = records.length ? 'partial' : 'failed';
    summary.error = metrics.limit ?? classifyError(error);
    log.error(summary.error);
    await session?.diagnose().catch(() => { /* Diagnostics must not mask source failures. */ });
    await Actor.setValue('RESULTS', { status: summary.status, error: summary.error, businesses: records, locations: summary.locations,
        unique_businesses: records.length, completeness_guaranteed: false });
} finally {
    await session?.close();
    await persist();
}
await Actor.exit({ exitCode: summary.status === 'failed' ? 1 : 0 });
