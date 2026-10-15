import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

import { installSourceDialogHandlers } from '../src/dialogs.js';

// Opt in when branded Chrome is installed; no source, proxy or Apify requests.
describe.skipIf(process.env.RUN_BROWSER_TESTS !== '1')('late source dialogs', () => {
    const fixture = `<button id="search" disabled onclick="document.body.dataset.searched='yes'">Search</button>
        <div id="overlay" hidden style="position:fixed;inset:0;background:white;z-index:1000">
        <button onclick="document.getElementById('overlay').hidden=true">Allow all cookies</button></div>
        <script>setTimeout(()=>{document.getElementById('overlay').hidden=false;document.getElementById('search').disabled=false},150)</script>`;
    it('demonstrates that a late cookie overlay obstructs the normal search click', async () => {
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        try {
            const page = await browser.newPage();
            await page.setContent(fixture);
            await expect(page.getByRole('button', { name: 'Search', exact: true }).click({ timeout: 700 })).rejects.toThrow();
            expect(await page.locator('body').getAttribute('data-searched')).toBeNull();
        } finally { await browser.close(); }
    });
    it('dismisses the late overlay and lets the same ordinary click complete', async () => {
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        try {
            const page = await browser.newPage();
            let dismissed = 0;
            await installSourceDialogHandlers(page, () => { dismissed++; });
            await page.setContent(fixture);
            await page.getByRole('button', { name: 'Search', exact: true }).click({ timeout: 5000 });
            expect(await page.locator('body').getAttribute('data-searched')).toBe('yes');
            expect(dismissed).toBe(1);
        } finally { await browser.close(); }
    });
    it('awaits restoring search input when accepting cookies clears the form', async () => {
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        try {
            const page = await browser.newPage();
            let restorations = 0;
            await installSourceDialogHandlers(page, async () => {
                await page.locator('#postcode').fill('CB1 1JY');
                restorations++;
            });
            await page.setContent(`<input id="postcode" value="CB1 1JY">
                <button id="search" disabled onclick="document.body.dataset.searched=document.getElementById('postcode').value">Search</button>
                <div id="overlay" hidden style="position:fixed;inset:0;background:white;z-index:1000">
                <button onclick="setTimeout(()=>{document.getElementById('postcode').value='';document.getElementById('overlay').hidden=true},100)">Allow all cookies</button></div>
                <script>setTimeout(()=>{document.getElementById('overlay').hidden=false;document.getElementById('search').disabled=false},150)</script>`);
            await page.getByRole('button', { name: 'Search', exact: true }).click({ timeout: 5000 });
            expect(await page.locator('body').getAttribute('data-searched')).toBe('CB1 1JY');
            expect(restorations).toBe(1);
        } finally { await browser.close(); }
    });
    it('reports callback failures without leaving an unhandled asynchronous rejection', async () => {
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        try {
            const page = await browser.newPage();
            const failures: unknown[] = [];
            await installSourceDialogHandlers(page, async () => { throw new Error('Synthetic callback failure'); }, (error) => { failures.push(error); });
            await page.setContent(fixture);
            await page.getByRole('button', { name: 'Search', exact: true }).click({ timeout: 5000 });
            expect(failures).toHaveLength(1);
            expect(await page.locator('body').getAttribute('data-searched')).toBe('yes');
        } finally { await browser.close(); }
    });
});
