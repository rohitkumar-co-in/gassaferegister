import { load } from 'cheerio';
import { gotScraping } from 'got-scraping';
import { CookieJar } from 'tough-cookie';

import { allowedCertificateExceptionUrl } from './config.js';
import { BASE, officialUrl } from './parser.js';

export function searchForm(html: string, location: string, serviceType: string) {
    const $ = load(html);
    const form = $('#FindAndCheckForm');
    if (form.length !== 1 || !form.find('#WidgetSearchTerm').length) throw new Error('SOURCE_FORM_UNRECOGNIZED');
    const fields: Record<string, string> = {};
    form.find('input[name]').each((_, element) => {
        const input = $(element);
        const type = (input.attr('type') || 'text').toLowerCase();
        if (input.is('[disabled]') || ['submit', 'button', 'file', 'reset'].includes(type)) return;
        if (['radio', 'checkbox'].includes(type) && !input.is('[checked]')) return;
        fields[input.attr('name')!] = input.attr('value') || '';
    });
    for (const [id, value] of [['WidgetSearchTerm', location], [`${serviceType}Search`, null], ['optFind', null]] as const) {
        const input = form.find(`#${id}`);
        const name = input.attr('name');
        if (name) fields[name] = value ?? input.attr('value') ?? '';
    }
    const method = (form.attr('method') || 'get').toUpperCase();
    if (!['GET', 'POST'].includes(method)) throw new Error('SOURCE_FORM_METHOD_UNSUPPORTED');
    return { url: officialUrl(form.attr('action') || BASE), method: method as 'GET' | 'POST', fields };
}

export async function httpProbe(options: {
    location: string; serviceType: string; proxyUrl: string; allowCertificateException: boolean;
    maxRequests: number; runtimeSeconds: number; onRequest: (stage: string) => void;
    onResponse: (stage: string, html: string, statusCode: number) => Promise<void>;
}) {
    const cookieJar = new CookieJar();
    const signal = AbortSignal.timeout(options.runtimeSeconds * 1000);
    let count = 0;
    async function fetchPage(url: string, method: 'GET' | 'POST', fields: Record<string, string> | undefined, stage: string) {
        let target = officialUrl(url);
        let currentMethod = method;
        let currentFields = fields;
        while (true) {
            if (!allowedCertificateExceptionUrl(target)) throw new Error('SOURCE_REDIRECT_REJECTED');
            if (++count > Math.min(options.maxRequests, 5)) throw new Error('SOURCE_REQUEST_LIMIT');
            options.onRequest(stage);
            const fieldOptions = currentMethod === 'POST' ? { form: currentFields } : { searchParams: currentFields };
            const response = await gotScraping({ url: target, method: currentMethod, proxyUrl: options.proxyUrl,
                cookieJar, signal, retry: { limit: 0 }, timeout: { request: 60000 }, followRedirect: false,
                throwHttpErrors: false, https: { rejectUnauthorized: !options.allowCertificateException },
                ...(currentFields ? fieldOptions : {}),
            });
            await options.onResponse(stage, response.body, response.statusCode);
            if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
                target = officialUrl(new URL(response.headers.location, target).href);
                if ([301, 302, 303].includes(response.statusCode)) { currentMethod = 'GET'; currentFields = undefined; }
                continue;
            }
            if (response.statusCode >= 400) throw new Error(`SOURCE_HTTP_${response.statusCode}`);
            return { html: response.body, sourceUrl: target };
        }
    }
    const home = await fetchPage(BASE, 'GET', undefined, 'http_homepage');
    const form = searchForm(home.html, options.location, options.serviceType);
    return fetchPage(form.url, form.method, form.fields, 'http_search_results');
}
