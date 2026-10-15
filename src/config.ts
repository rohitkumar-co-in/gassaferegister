export interface Input {
    mode?: 'offlineTest' | 'probe' | 'scrape';
    location?: string;
    locations?: string[];
    locationCounty?: string;
    searchMethod?: 'siteUi' | 'nativeForm' | 'keyboard' | 'validatedForm';
    page?: number;
    maxPages?: number;
    maxResults?: number;
    includeEngineers?: boolean;
    includeQualifications?: boolean;
    maxEngineerPages?: number;
    maxEngineersPerBusiness?: number;
    requestDelayMillis?: number;
    serviceType?: 'Domestic' | 'Commercial';
    useUkResidentialProxy?: boolean;
    browserProfile?: 'plainHeadless' | 'crawleeChrome' | 'unblockerHttp' | 'chromeHeaded' | 'chromeHeadless' | 'chromiumHeaded' | 'camoufoxHeaded' | 'patchrightHeaded';
    proxyCountry?: 'GB' | 'AUTO';
    proxyService?: 'residential' | 'unblocker';
    allowUnblockerCertificateException?: boolean;
    maxRuntimeSeconds?: number;
    maxNetworkRequests?: number;
    loadPageAssets?: boolean;
    settleSeconds?: number;
    maxTransferMegabytes?: number;
}
export function validateInput(raw: Input) {
    const input = { mode: 'offlineTest', location: 'CB1 1JY', serviceType: 'Domestic', useUkResidentialProxy: false,
        browserProfile: 'camoufoxHeaded', proxyCountry: 'GB', proxyService: 'residential', allowUnblockerCertificateException: false,
        maxRuntimeSeconds: 90, maxNetworkRequests: 80, loadPageAssets: false, settleSeconds: 0, maxTransferMegabytes: 5,
        locations: [], locationCounty: '', searchMethod: 'siteUi', page: 1, maxPages: 1, maxResults: 10, includeEngineers: true,
        includeQualifications: true, maxEngineerPages: 2, maxEngineersPerBusiness: 10, requestDelayMillis: 1000,
        ...raw } as Required<Input>;
    if (!['offlineTest', 'probe', 'scrape'].includes(input.mode)) throw new Error('Invalid mode');
    if (typeof input.location !== 'string' || !input.location.trim() || input.location.length > 120) throw new Error('Invalid location');
    if (!['Domestic', 'Commercial'].includes(input.serviceType)) throw new Error('Invalid serviceType');
    if (typeof input.useUkResidentialProxy !== 'boolean') throw new Error('Invalid proxy setting');
    if (!['plainHeadless', 'crawleeChrome', 'unblockerHttp', 'chromeHeaded', 'chromeHeadless', 'chromiumHeaded', 'camoufoxHeaded', 'patchrightHeaded'].includes(input.browserProfile)) throw new Error('Invalid browserProfile');
    if (input.browserProfile === 'unblockerHttp' && (!input.useUkResidentialProxy || input.proxyService !== 'unblocker')) throw new Error('Invalid HTTP profile: requires Unblocker');
    if (!['GB', 'AUTO'].includes(input.proxyCountry)) throw new Error('Invalid proxyCountry');
    if (!['residential', 'unblocker'].includes(input.proxyService)) throw new Error('Invalid proxyService');
    if (typeof input.allowUnblockerCertificateException !== 'boolean') throw new Error('Invalid certificate exception');
    if (typeof input.loadPageAssets !== 'boolean') throw new Error('Invalid asset setting');
    if (input.allowUnblockerCertificateException && (!['probe', 'scrape'].includes(input.mode) || !input.useUkResidentialProxy || input.proxyService !== 'unblocker')) {
        throw new Error('Invalid certificate exception: requires live Unblocker probe');
    }
    for (const [key, min, max] of [['maxRuntimeSeconds', 15, 180], ['maxNetworkRequests', 10, 300], ['settleSeconds', 0, 10], ['maxTransferMegabytes', 1, 10]] as const) {
        if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) throw new Error(`Invalid ${key}`);
    }
    if (!Array.isArray(input.locations) || input.locations.length > 10 || input.locations.some((value) => typeof value !== 'string' || !value.trim() || value.length > 120)) throw new Error('Invalid locations');
    if (!['siteUi', 'nativeForm', 'keyboard', 'validatedForm'].includes(input.searchMethod)) throw new Error('Invalid searchMethod');
    if (typeof input.locationCounty !== 'string' || input.locationCounty.length > 120) throw new Error('Invalid locationCounty');
    for (const key of ['includeEngineers', 'includeQualifications'] as const) {
        if (typeof input[key] !== 'boolean') throw new Error(`Invalid ${key}`);
    }
    for (const [key, min, max] of [['page', 1, 100], ['maxPages', 1, 25], ['maxResults', 1, 250], ['maxEngineerPages', 1, 10], ['maxEngineersPerBusiness', 1, 100], ['requestDelayMillis', 500, 10000]] as const) {
        if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) throw new Error(`Invalid ${key}`);
    }
    if (input.includeQualifications && !input.includeEngineers) input.includeQualifications = false;
    input.locations = input.locations.map((value) => value.trim());
    input.location = input.location.trim();
    return input;
}

export function allowedCertificateExceptionUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && !url.port
            && ['www.gassaferegister.co.uk', 'gassaferegister.co.uk'].includes(url.hostname);
    } catch { return false; }
}
