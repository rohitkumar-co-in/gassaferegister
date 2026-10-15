import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

import { installSourceDialogHandlers } from '../src/dialogs.js';
import { prepareSourceLookup, prepareSourceSearch, sourceSearchButton } from '../src/search-controls.js';

describe.skipIf(process.env.RUN_BROWSER_TESTS !== '1')('source Search button accessibility', () => {
    it('selects Check mode before entering a registration number', async () => {
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        try {
            const page = await browser.newPage();
            await page.setContent(`<form id="FindAndCheckForm">
                <input id="optFind" type="radio" name="mode" checked>
                <input id="optCheck" type="radio" name="mode">
                <input id="WidgetSearchTerm" required>
                <button type="submit" aria-label="Search">Search</button></form>`);
            await prepareSourceLookup(page, '947637');
            expect(await page.locator('#optCheck').isChecked()).toBe(true);
            expect(await page.locator('#WidgetSearchTerm').inputValue()).toBe('947637');
        } finally { await browser.close(); }
    });
    it('clicks the visible Check label when the custom radio input is hidden', async () => {
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        try {
            const page = await browser.newPage();
            await page.setContent(`<form id="FindAndCheckForm">
                <input id="optFind" type="radio" name="mode" checked>
                <label for="optCheck">Check</label><input id="optCheck" type="radio" name="mode" style="display:none">
                <input id="WidgetSearchTerm" required>
                <button type="submit" aria-label="Search">Search</button></form>`);
            await prepareSourceLookup(page, '947637');
            expect(await page.locator('#optCheck').isChecked()).toBe(true);
            expect(await page.locator('#WidgetSearchTerm').inputValue()).toBe('947637');
        } finally { await browser.close(); }
    });
    it('handles a late consent prompt before setting Check mode and registration value', async () => {
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        try {
            const page = await browser.newPage();
            let dismissed = 0;
            await installSourceDialogHandlers(page, () => { dismissed++; });
            await page.setContent(`<form id="FindAndCheckForm">
                <input id="optFind" type="radio" name="mode" checked>
                <input id="optCheck" type="radio" name="mode">
                <input id="WidgetSearchTerm" required>
                <button type="submit" aria-label="Search">Search</button></form>
                <div id="overlay" hidden style="position:fixed;inset:0;background:white;z-index:1000">
                <button onclick="setTimeout(()=>{document.getElementById('WidgetSearchTerm').value='';document.getElementById('optFind').checked=true;document.getElementById('optCheck').checked=false;document.getElementById('overlay').hidden=true},100)">Allow all cookies</button></div>
                <script>setTimeout(()=>{document.getElementById('overlay').hidden=false},150)</script>`);
            await page.waitForTimeout(200);
            await prepareSourceLookup(page, '947637');
            expect(dismissed).toBe(1);
            expect(await page.locator('#optCheck').isChecked()).toBe(true);
            expect(await page.locator('#WidgetSearchTerm').inputValue()).toBe('947637');
        } finally { await browser.close(); }
    });
    it('fills the postcode after a late consent dialog clears it', async () => {
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        try {
            const page = await browser.newPage();
            let dismissed = 0;
            await installSourceDialogHandlers(page, () => { dismissed++; });
            await page.setContent(`<form id="FindAndCheckForm" onsubmit="event.preventDefault();document.body.dataset.searched=document.getElementById('WidgetSearchTerm').value">
                <input id="WidgetSearchTerm" required value="old value"><input id="DomesticSearch" type="radio" checked>
                <button id="submit" type="submit" aria-label="Search" disabled>Search</button></form>
                <div id="overlay" hidden style="position:fixed;inset:0;background:white;z-index:1000">
                <button onclick="setTimeout(()=>{document.getElementById('WidgetSearchTerm').value='';document.getElementById('overlay').hidden=true},100)">Allow all cookies</button></div>
                <script>setTimeout(()=>{document.getElementById('overlay').hidden=false;document.getElementById('submit').disabled=false},150)</script>`);
            await page.waitForTimeout(200);
            await prepareSourceSearch(page, 'CB1 1JY', 'Domestic');
            await (await sourceSearchButton(page)).click();
            expect(dismissed).toBe(1);
            expect(await page.locator('body').getAttribute('data-searched')).toBe('CB1 1JY');
        } finally { await browser.close(); }
    });
    it('submits through the verified selector when CSS and role locators match the same button', async () => {
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        try {
            const page = await browser.newPage();
            await page.setContent(`<style>.icon::before { content: "\\e003"; }</style>
                <button onclick="document.body.dataset.wrong='yes'">Search</button>
                <form id="FindAndCheckForm" onsubmit="event.preventDefault();document.body.dataset.searched='yes'">
                    <button type="submit" aria-label="Search">Search <span class="icon"></span></button>
                </form>`);
            expect(await page.locator('#FindAndCheckForm').getByRole('button', { name: 'Search', exact: true }).count()).toBe(1);
            await (await sourceSearchButton(page)).click();
            expect(await page.locator('body').getAttribute('data-searched')).toBe('yes');
            expect(await page.locator('body').getAttribute('data-wrong')).toBeNull();
        } finally { await browser.close(); }
    });
});
