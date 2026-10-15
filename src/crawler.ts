import type { Input } from './config.js';
import { type Engineer, parseEngineers, parseQualifications } from './details.js';
import { classifyError, isRetryableVisitError } from './errors.js';
import { officialUrl, parseBusinesses } from './parser.js';

export interface SourcePage { html: string; url: string }
export interface SourceSession {
    search(location: string, county: string): Promise<SourcePage>;
    visit(url: string): Promise<SourcePage>;
}
const accessFailure = (error: string) => /BLOCKED|LIMIT|TRANSPORT|DIALOG|SOURCE_VALIDATION_HTTP_(?:403|429)/.test(error);

export async function visitWithBoundedRetry(session: SourceSession, url: string, onRetry: () => void = () => undefined): Promise<SourcePage> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await session.visit(url);
        } catch (error) {
            if (attempt >= 1 || !isRetryableVisitError(error)) throw error;
            onRetry();
            await new Promise<void>((resolve) => { setTimeout(resolve, 500); });
        }
    }
}

export function getRunStatus(locations: LocationResult[], businessCount: number, sourceLimit: string | null): 'succeeded' | 'partial' | 'failed' {
    if (locations.length && locations.every((location) => location.status === 'succeeded') && !sourceLimit) return 'succeeded';
    if (businessCount > 0 || locations.some((location) => location.status === 'succeeded')) return 'partial';
    return 'failed';
}
export interface LocationResult {
    location: string;
    page: number;
    last_page: number | null;
    max_pages: number;
    pages_fetched: number;
    total_results: number | null;
    total_pages: number | null;
    has_more: boolean;
    unique_results: number;
    duplicates_skipped: number;
    pagination_exhausted: boolean;
    status: string;
    error: string | null;
}
export type Business = ReturnType<typeof parseBusinesses>['businesses'][number] & {
    trading_name: string | null;
    location: string;
    service_type: string;
    source_url: string | null;
    source_kind: string;
    scraped_at: string;
    engineers: Engineer[];
    qualifications: (ReturnType<typeof parseQualifications>[number] & { engineer_name: string })[];
    enrichment_status: string;
    enrichment_error: string | null;
    engineers_truncated: boolean;
};
export function selectTown(matches: string[], location: string, county: string): number {
    const norm = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
    const candidates = matches.map((text, index) => ({ text, index })).filter(({ text }) => {
        const [town, ...rest] = text.split(/\s+-\s+/);
        return norm(town ?? '') === norm(location) && (!county || norm(rest.join(' - ')) === norm(county));
    });
    const unique = new Set(candidates.map(({ text }) => norm(text)));
    if (candidates.length && unique.size === 1) return candidates[0]!.index;
    throw new Error('SOURCE_AMBIGUOUS_LOCATION: provide locationCounty or a full postcode');
}
export async function crawl(session: SourceSession, input: Required<Input>, hooks: {
    record: (record: Business) => Promise<void>;
    progress: (locations: LocationResult[]) => Promise<void>;
    existing?: Business[];
    canCreateRecord?: () => boolean;
    onRetry?: () => void;
}) {
    const records = [...(hooks.existing ?? [])];
    const seen = new Set(records.map((record) => record.registration_number));
    const locations: LocationResult[] = [];
    let fatal = false;
    for (const location of [...new Set(input.locations.length ? input.locations : [input.location])]) {
        if (records.length >= input.maxResults || fatal) break;
        const info: LocationResult = { location, page: input.page, last_page: null, max_pages: input.maxPages,
            pages_fetched: 0, total_results: null, total_pages: null, has_more: true, unique_results: 0,
            duplicates_skipped: 0, pagination_exhausted: false, status: 'running', error: null };
        locations.push(info);
        try {
            let current = await session.search(location, input.locationCounty);
            if (input.page !== 1) {
                const first = parseBusinesses(current.html);
                if (first.total_results !== null && input.page > Math.max(1, Math.ceil(first.total_results / 10))) throw new Error('SOURCE_PAGE_OUT_OF_RANGE');
                const url = new URL(current.url);
                url.searchParams.set('Page', String(input.page));
                current = await visitWithBoundedRetry(session, officialUrl(url.href), hooks.onRetry);
            }
            const visited = new Set<string>();
            for (let offset = 0; offset < input.maxPages; offset++) {
                if (visited.has(current.url)) throw new Error('SOURCE_PAGINATION_LOOP');
                visited.add(current.url);
                const parsed = parseBusinesses(current.html);
                info.pages_fetched++;
                info.last_page = input.page + offset;
                info.total_results = parsed.total_results;
                info.total_pages = parsed.total_results === null ? null : Math.ceil(parsed.total_results / 10);
                info.has_more = Boolean(parsed.next_page_url);
                let processed = 0;
                for (const business of parsed.businesses) {
                    if (records.length >= input.maxResults) break;
                    processed++;
                    if (seen.has(business.registration_number)) { info.duplicates_skipped++; continue; }
                    if (hooks.canCreateRecord && !hooks.canCreateRecord()) {
                        info.error = 'USER_MAX_CHARGE_REACHED';
                        fatal = true;
                        break;
                    }
                    const record: Business = { ...business, trading_name: null, location, service_type: input.serviceType,
                        source_url: input.mode === 'offlineTest' ? null : current.url,
                        source_kind: input.mode === 'offlineTest' ? 'synthetic_fixture' : 'live', scraped_at: new Date().toISOString(),
                        engineers: [], qualifications: [], enrichment_status: input.includeEngineers ? 'pending' : 'not_requested',
                        enrichment_error: null, engineers_truncated: false };
                    if (input.includeEngineers && business.engineers_url) {
                        try {
                            let url: string | null = business.engineers_url;
                            const engineerPages = new Set<string>();
                            const engineerKeys = new Set<string>();
                            for (let n = 0; url && n < input.maxEngineerPages; n++) {
                                if (engineerPages.has(url)) throw new Error('SOURCE_PAGINATION_LOOP');
                                engineerPages.add(url);
                                const detail = parseEngineers((await visitWithBoundedRetry(session, url, hooks.onRetry)).html);
                                record.trading_name = detail.trading_name;
                                for (const engineer of detail.engineers) {
                                    const key = engineer.qualifications_url ?? `${engineer.name}:${engineer.telephone}`;
                                    if (engineerKeys.has(key)) continue;
                                    if (record.engineers.length >= input.maxEngineersPerBusiness) { record.engineers_truncated = true; break; }
                                    engineerKeys.add(key);
                                    if (input.includeQualifications && engineer.qualifications_url) {
                                        try {
                                            engineer.qualifications = parseQualifications((await visitWithBoundedRetry(session, engineer.qualifications_url, hooks.onRetry)).html);
                                            engineer.qualifications_status = 'succeeded';
                                        } catch (error) {
                                            engineer.qualifications_status = 'failed';
                                            engineer.error = classifyError(error);
                                            if (accessFailure(engineer.error)) fatal = true;
                                        }
                                    }
                                    if (input.includeQualifications && !engineer.qualifications_url) { engineer.qualifications_status = 'unavailable'; engineer.error = 'SOURCE_QUALIFICATIONS_UNAVAILABLE'; }
                                    record.engineers.push(engineer);
                                    if (fatal) break;
                                }
                                url = detail.next_page_url;
                                if (fatal || record.engineers.length >= input.maxEngineersPerBusiness) break;
                            }
                            record.engineers_truncated ||= Boolean(url);
                            record.qualifications = record.engineers.flatMap((engineer) => engineer.qualifications.map((qualification) => ({ ...qualification, engineer_name: engineer.name })));
                            record.enrichment_status = record.engineers.some((engineer) => ['failed', 'unavailable'].includes(engineer.qualifications_status)) || record.engineers_truncated ? 'partial' : 'succeeded';
                        } catch (error) {
                            record.enrichment_status = 'failed';
                            record.enrichment_error = classifyError(error);
                            if (accessFailure(record.enrichment_error)) fatal = true;
                        }
                    } else if (input.includeEngineers) {
                        record.enrichment_status = 'unavailable';
                    }
                    await hooks.record(record);
                    records.push(record);
                    seen.add(record.registration_number);
                    info.unique_results++;
                    await hooks.progress(locations);
                    if (fatal) break;
                }
                if (processed < parsed.businesses.length) info.has_more = true;
                if (!parsed.next_page_url) { info.pagination_exhausted = processed === parsed.businesses.length; break; }
                if (fatal || records.length >= input.maxResults || offset + 1 >= input.maxPages) break;
                current = await visitWithBoundedRetry(session, parsed.next_page_url, hooks.onRetry);
            }
            info.status = fatal || records.some((record) => record.location === location && ['partial', 'failed', 'unavailable'].includes(record.enrichment_status)) ? 'partial' : 'succeeded';
        } catch (error) {
            info.status = info.unique_results ? 'partial' : 'failed';
            info.error = classifyError(error);
            if (accessFailure(info.error)) fatal = true;
        }
        await hooks.progress(locations);
    }
    return { records, locations, fatal };
}
