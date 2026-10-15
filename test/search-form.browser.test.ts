import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

import { submitValidatedForm } from '../src/search-form.js';

const fixture = `<form id="FindAndCheckForm" action="/widgetfc" method="post" data-validationurl="/tpv">
    <input name="Postcode" value="CB1 1JY"><input name="ServiceType" value="Domestic">
    <input type="hidden" name="__RequestVerificationToken" value="synthetic-token">
    <input type="hidden" id="MatchedLocationLat" name="MatchedLocationLat"></form>`;
describe.skipIf(process.env.RUN_BROWSER_TESTS !== '1')('observed validation request protocol', () => {
    it('sends current form state and token, then posts the validated form', async () => {
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        try {
            const page = await browser.newPage();
            const paths: string[] = [];
            await page.route('http://example.invalid/**', async (route) => {
                const path = new URL(route.request().url()).pathname;
                if (path === '/tpv') {
                    paths.push(path);
                    expect(route.request().headers().requestverificationtoken).toBe('synthetic-token');
                    expect(new URLSearchParams(route.request().postData()!).get('Postcode')).toBe('CB1 1JY');
                    await route.fulfill({ json: { statuscode: 200, matchedlocationlat: 52.2 } });
                } else if (path === '/widgetfc') {
                    paths.push(path);
                    expect(new URLSearchParams(route.request().postData()!).get('MatchedLocationLat')).toBe('52.2');
                    await route.fulfill({ contentType: 'text/html', body: '<h1>Completed</h1>' });
                } else { await route.fulfill({ contentType: 'text/html', body: fixture }); }
            });
            await page.goto('http://example.invalid/');
            await Promise.all([page.waitForURL('**/widgetfc'), page.evaluate(submitValidatedForm)]);
            expect(paths).toEqual(['/tpv', '/widgetfc']);
        } finally { await browser.close(); }
    });
    it('stops at a rejected validation response instead of submitting anyway', async () => {
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        try {
            const page = await browser.newPage();
            let submitted = false;
            await page.route('http://example.invalid/**', async (route) => {
                const path = new URL(route.request().url()).pathname;
                if (path === '/tpv') await route.fulfill({ status: 403, body: 'Denied' });
                else {
                    if (path === '/widgetfc') submitted = true;
                    await route.fulfill({ contentType: 'text/html', body: fixture });
                }
            });
            await page.goto('http://example.invalid/');
            await expect(page.evaluate(submitValidatedForm)).rejects.toThrow('SOURCE_VALIDATION_HTTP_403');
            expect(submitted).toBe(false);
        } finally { await browser.close(); }
    });
});
