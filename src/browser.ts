import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Actor } from 'apify';
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';

import { allowedCertificateExceptionUrl, type Input } from './config.js';
import { parseSourceCookies } from './cookies.js';
import { selectTown, type SourcePage, type SourceSession } from './crawler.js';
import { assertSource } from './details.js';
import { installSourceDialogHandlers } from './dialogs.js';
import { BASE, officialUrl } from './parser.js';
import { prepareSourceSearch, sourceSearchButton } from './search-controls.js';
import { submitValidatedForm } from './search-form.js';

export interface BrowserMetrics { network_requests: number; transferred_bytes: number; browser_user_agent: string; limit: string | null; dialogs_dismissed?: number; dialog_error?: string; imported_cookie_count?: number; proxy_country?: string; proxy_ip_fingerprint?: string }
export async function createBrowserSession(input: Required<Input>, liveMetrics: BrowserMetrics): Promise<SourceSession & { close(): Promise<void>; diagnose(): Promise<void> }> {
    const metrics = liveMetrics;
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;
    const traceStarted = Date.now();
    const responses: { path: string; status: number; method: string; blocked: boolean; elapsed_ms: number; resource_type: string }[] = [];
    const scriptErrors: string[] = [];
    const close = async () => { await context?.close().catch(() => { /* Best-effort cleanup or diagnostics. */ }); await browser?.close().catch(() => { /* Best-effort cleanup or diagnostics. */ }); };
    const limit = (reason: string) => { metrics.limit ??= reason; void close(); };
    const timer = setTimeout(() => limit('RUNTIME_LIMIT'), input.maxRuntimeSeconds * 1000);
    try {
        let proxy: { server: string; username: string; password: string } | undefined;
        if (input.useUkResidentialProxy) {
            const config = await Actor.createProxyConfiguration({ groups: [input.proxyService === 'unblocker' ? 'UNBLOCKER' : 'RESIDENTIAL'],
                countryCode: input.proxyCountry === 'GB' ? 'GB' : undefined });
            const fixedSession = process.env.GAS_SAFE_PROXY_SESSION;
            if (fixedSession && !/^[a-zA-Z0-9]{1,50}$/.test(fixedSession)) throw new Error('Invalid proxy session');
            const value = await config?.newUrl(input.proxyService === 'unblocker' ? undefined : fixedSession ?? `gassafe${Date.now()}`);
            if (!value) throw new Error('PROXY_CONFIGURATION_UNAVAILABLE');
            const url = new URL(value);
            proxy = { server: `${url.protocol}//${url.host}`, username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
        }
        if (input.browserProfile === 'camoufoxHeaded') {
            const { Camoufox } = await import('camoufox-js');
            browser = await Camoufox({ headless: false, os: 'linux', locale: 'en-GB', proxy, geoip: false,
                exclude_addons: ['UBO'], humanize: true, executable_path: process.env.GAS_SAFE_CAMOUFOX_PATH }) as unknown as Browser;
            context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false,
                ignoreHTTPSErrors: input.allowUnblockerCertificateException });
        } else {
            const launcher = input.browserProfile === 'patchrightHeaded' ? (await import('patchright')).chromium : chromium;
            context = await launcher.launchPersistentContext(await mkdtemp(join(tmpdir(), 'gas-safe-profile-')), {
                ...(['chromiumHeaded', 'plainHeadless'].includes(input.browserProfile) ? {} : { channel: 'chrome' }),
                headless: ['plainHeadless', 'chromeHeadless'].includes(input.browserProfile), proxy, locale: 'en-GB',
                viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: false,
                ignoreHTTPSErrors: input.allowUnblockerCertificateException,
            }) as unknown as BrowserContext;
        }
        if (metrics.limit) { await close(); throw new Error(metrics.limit); }
        // Never use the owner's stored browser session by default. This remains
        // an explicit private-beta opt-in only; public runs must use their own
        // clean session and must not inherit the developer's identity.
        if (process.env.GAS_SAFE_USE_PRIVATE_COOKIES === 'true' && process.env.GAS_SAFE_COOKIES_JSON) {
            const cookies = parseSourceCookies(process.env.GAS_SAFE_COOKIES_JSON);
            try { await context.addCookies(cookies); } catch { throw new Error('Invalid source cookies: browser rejected import'); }
            metrics.imported_cookie_count = cookies.length;
        }
        page = context.pages()[0] ?? await context.newPage();
        await installSourceDialogHandlers(page, () => {
            metrics.dialogs_dismissed = (metrics.dialogs_dismissed ?? 0) + 1;
        }, () => { metrics.dialog_error = 'SOURCE_DIALOG_DISMISS_FAILED'; });
        page.on('pageerror', (error) => {
            if (scriptErrors.length < 10) scriptErrors.push(error.message.replace(/https?:\/\/\S+/g, '[URL redacted]').slice(0, 200));
        });
        page.on('response', async (response) => {
            const url = new URL(response.url());
            if (!['gassaferegister.co.uk', 'www.gassaferegister.co.uk'].includes(url.hostname) || responses.length >= 100) return;
            const entry = { path: url.pathname, status: response.status(), method: response.request().method(), blocked: false,
                elapsed_ms: Date.now() - traceStarted, resource_type: response.request().resourceType() };
            responses.push(entry);
            if (['/tpv', '/widgetfc'].includes(url.pathname)) {
                const body = await response.text().catch(() => '');
                entry.blocked = /access denied|request unsuccessful|blocked by our security service/i.test(body);
            }
        });
        page.setDefaultTimeout(12000);
        page.setDefaultNavigationTimeout(25000);
        metrics.browser_user_agent = await page.evaluate(() => navigator.userAgent);
        if (input.browserProfile === 'camoufoxHeaded') {
            page.on('requestfinished', async (request) => {
                const sizes = await request.sizes().catch(() => null);
                if (sizes) metrics.transferred_bytes += sizes.responseBodySize + sizes.responseHeadersSize;
                else {
                    const response = await request.response().catch(() => null);
                    const body = await response?.body().catch(() => null);
                    metrics.transferred_bytes += body?.byteLength ?? 0;
                }
                if (metrics.transferred_bytes > input.maxTransferMegabytes * 1024 * 1024) limit('TRANSFER_LIMIT');
            });
        } else {
            const cdp = await context.newCDPSession(page);
            await cdp.send('Network.enable');
            cdp.on('Network.loadingFinished', (event) => {
                metrics.transferred_bytes += event.encodedDataLength;
                if (metrics.transferred_bytes > input.maxTransferMegabytes * 1024 * 1024) limit('TRANSFER_LIMIT');
            });
        }
        await context.route('**/*', async (route) => {
            if (input.allowUnblockerCertificateException && !allowedCertificateExceptionUrl(route.request().url())) { await route.abort(); return; }
            if (!input.loadPageAssets && ['image', 'media', 'font'].includes(route.request().resourceType())) { await route.abort(); return; }
            if (metrics.limit || metrics.network_requests >= input.maxNetworkRequests) {
                await route.abort();
                limit(metrics.limit ?? 'NETWORK_REQUEST_LIMIT');
                return;
            }
            metrics.network_requests++;
            await route.continue();
        });
        if (process.env.GAS_SAFE_VERIFY_PROXY === '1') {
            if (!input.useUkResidentialProxy || input.proxyCountry !== 'GB' || input.proxyService !== 'residential') throw new Error('PROXY_VERIFICATION_REQUIRES_GB_RESIDENTIAL');
            metrics.network_requests++;
            try {
                const response = await context.request.get('https://api.apify.com/v2/browser-info?skipHeaders=true', { timeout: 15000 });
                const body = await response.body();
                metrics.transferred_bytes += body.byteLength;
                const info = JSON.parse(body.toString('utf8')) as { countryCode?: string; clientIp?: string };
                if (!response.ok() || info.countryCode !== 'GB' || typeof info.clientIp !== 'string') throw new Error('Verification failed');
                metrics.proxy_country = info.countryCode;
                metrics.proxy_ip_fingerprint = createHash('sha256').update(`${process.env.GAS_SAFE_PROXY_SESSION ?? ''}|${info.clientIp}`).digest('hex').slice(0, 24);
            } catch { throw new Error('PROXY_GB_VERIFICATION_FAILED'); }
        }
        let lastVisit = 0;
        const throttle = async () => {
            if (metrics.limit) throw new Error(metrics.limit);
            const wait = input.requestDelayMillis - (Date.now() - lastVisit);
            if (wait > 0) await new Promise((resolve) => { setTimeout(resolve, wait); });
            lastVisit = Date.now();
        };
        const check = async () => {
            if (metrics.limit) throw new Error(metrics.limit);
            if (metrics.dialog_error) throw new Error(metrics.dialog_error);
            const currentPath = new URL(page!.url()).pathname;
            const documentResponse = [...responses].reverse().find((entry) => entry.resource_type === 'document' && entry.path === currentPath);
            if (documentResponse && [403, 429].includes(documentResponse.status)) throw new Error('SOURCE_BLOCKED');
            const frames = await Promise.all(page!.frames().map(async (frame) => frame.locator('body').innerText({ timeout: 1500 }).catch(() => '')));
            assertSource(frames.join(' '));
        };
        const snapshot = async (): Promise<SourcePage> => { await check(); return { html: await page!.content(), url: page!.url() }; };
        const ready = async () => {
            await page!.waitForFunction(() => Boolean(document.querySelector('.buscard,.show-engineers,#DomesticTable,#CommercialTable'))
                || /Multiple matches were found|no (?:registered )?(?:businesses|engineers|results|matches) (?:were )?found|request unsuccessful|access denied/i.test(document.body.innerText),
            undefined, { timeout: 12000 }).catch(() => { /* Best-effort cleanup or diagnostics. */ });
            await check();
        };
        return {
            async lookup(registrationNumber) {
                await throttle();
                try {
                    await page!.goto(BASE, { waitUntil: 'domcontentloaded' });
                    if (input.settleSeconds) await new Promise((resolve) => { setTimeout(resolve, input.settleSeconds * 1000); });
                    await check();
                    const checkBusiness = page!.getByRole('link', { name: /check (?:a )?business/i })
                        .or(page!.getByRole('button', { name: /check (?:a )?business/i }))
                        .or(page!.getByRole('tab', { name: /check (?:a )?business/i })).first();
                    if (await checkBusiness.count() && await checkBusiness.isVisible()) await checkBusiness.click();
                    const registrationField = page!.locator('input[name*="reg" i],input[id*="reg" i],input[placeholder*="registration" i],#postCodeTownlabel,#WidgetSearchTerm').filter({ visible: true }).first();
                    if (!await registrationField.count()) throw new Error('SOURCE_REGISTRATION_FORM_NOT_FOUND');
                    await registrationField.fill(registrationNumber);
                    if (await registrationField.inputValue() !== registrationNumber) throw new Error('SOURCE_REGISTRATION_VALUE_NOT_SET');
                    const form = registrationField.locator('xpath=ancestor::form[1]');
                    const submit = form.locator('button[type="submit"],input[type="submit"]').first();
                    await Promise.all([
                        page!.waitForFunction(() => Boolean(document.querySelector('.buscard,[data-testid="registrationNumber"]'))
                            || /no (?:registered )?(?:business|results|matches)|registration number.{0,30}(?:not found|invalid)/i.test(document.body.innerText), undefined, { timeout: 15000 }),
                        await submit.count() && await submit.isVisible() ? submit.click() : registrationField.press('Enter'),
                    ]);
                    await check();
                    return await snapshot();
                } catch (error) {
                    if (metrics.limit) throw new Error(metrics.limit);
                    if (metrics.dialog_error) throw new Error(metrics.dialog_error);
                    if (responses.some((entry) => ['/tpv', '/widgetfc'].includes(entry.path) && (entry.blocked || entry.status >= 400))) throw new Error('SOURCE_SEARCH_REJECTED');
                    throw error;
                }
            },
            async visit(url) {
                await throttle();
                try { await page!.goto(officialUrl(url), { waitUntil: 'domcontentloaded' }); await ready(); return await snapshot(); }
                catch (error) { if (metrics.limit) throw new Error(metrics.limit); throw error; }
            },
            async search(location, county) {
                await throttle();
                try {
                    await page!.goto(BASE, { waitUntil: 'domcontentloaded' });
                    if (input.settleSeconds) await new Promise((resolve) => { setTimeout(resolve, input.settleSeconds * 1000); });
                    await check();
                    await prepareSourceSearch(page!, location, input.serviceType);
                    const submit = async () => {
                        if (input.searchMethod === 'keyboard') { await page!.locator('#WidgetSearchTerm').press('Enter'); return; }
                        if (input.searchMethod === 'validatedForm') { await page!.evaluate(submitValidatedForm); return; }
                        if (input.searchMethod === 'nativeForm') { await page!.evaluate(() => {
                            const form = document.querySelector('#FindAndCheckForm');
                            if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== 'post'
                                || new URL(form.action).origin !== window.location.origin || new URL(form.action).pathname !== '/widgetfc') throw new Error('SOURCE_LAYOUT_CHANGED: search form');
                            // Submit the observed public search form normally, without the optional AJAX pre-validation step.
                            HTMLFormElement.prototype.submit.call(form);
                        }); return; }
                        await sourceSearchButton(page!).click();
                    };
                    await Promise.all([
                        page!.waitForURL((url) => url.pathname !== '/', { waitUntil: 'domcontentloaded' }),
                        submit(),
                    ]);
                    await ready();
                    if (/Multiple matches were found/i.test(await page!.locator('body').innerText())) {
                        const links = page!.getByRole('link').filter({ hasText: /^\s*[^\n]+\s+-\s+[^\n]+\s*$/ });
                        const names = await links.allTextContents();
                        const selected = selectTown(names, location, county);
                        await throttle();
                        await links.nth(selected).click();
                        await page!.locator('.buscard').first().waitFor({ timeout: 12000 }).catch(() => { /* Best-effort cleanup or diagnostics. */ });
                        await ready();
                    }
                    return await snapshot();
                } catch (error) {
                    if (metrics.limit) throw new Error(metrics.limit);
                    if (metrics.dialog_error) throw new Error(metrics.dialog_error);
                    if (responses.some((entry) => ['/tpv', '/widgetfc'].includes(entry.path) && (entry.blocked || entry.status >= 400))) throw new Error('SOURCE_SEARCH_REJECTED');
                    throw error;
                }
            },
            async diagnose() {
                if (!page || page.isClosed()) return;
                const text = (await page.locator('body').innerText({ timeout: 1500 }).catch(() => '')).slice(0, 3000)
                    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP redacted]');
                const form = await page.evaluate(() => {
                    const field = document.querySelector<HTMLInputElement>('#WidgetSearchTerm');
                    return field ? { valid: field.validity.valid, message: field.validationMessage, value: field.value } : null;
                }).catch(() => null);
                await Actor.setValue('ACCESS-DIAGNOSTIC', { path: new URL(page.url()).pathname, text, form, responses, scriptErrors });
                await Actor.setValue('DIAGNOSTIC.png', await page.screenshot({ fullPage: false }), { contentType: 'image/png' }).catch(() => { /* Best-effort cleanup or diagnostics. */ });
            },
            async close() { clearTimeout(timer); await close(); },
        };
    } catch (error) { clearTimeout(timer); await close(); throw error; }
}
