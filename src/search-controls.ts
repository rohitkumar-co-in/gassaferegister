import type { Page } from 'playwright';

import { dismissVisibleSourceDialogs } from './dialogs.js';

/** Prefer the user-verified label; retain support for older unlabelled markup. */
export async function sourceSearchButton(page: Page) {
    const form = page.locator('#FindAndCheckForm');
    // Prefer the selector verified against the live register. Avoid combining
    // it with the role locator via `or()`: both can resolve to the same submit
    // control and Playwright may treat that as an ambiguous strict locator.
    const labelled = form.locator('button[type="submit"][aria-label="Search"]');
    if (await labelled.count()) return labelled.first();
    return form.getByRole('button', { name: /^\s*Search(?:\s|$)/ }).first();
}

/** Recheck consent while waiting: a banner can arrive during actionability checks. */
async function waitForSourceSearchControl(page: Page) {
    for (let attempt = 0; attempt < 8; attempt++) {
        await dismissVisibleSourceDialogs(page);
        try {
            await (await sourceSearchButton(page)).click({ trial: true, timeout: 1000 });
            return;
        } catch (error) {
            if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error;
            if (attempt === 7) throw new Error('SOURCE_SEARCH_CONTROL_UNAVAILABLE');
        }
    }
}

/** Resolve blocking dialogs before entering values that consent may clear. */
export async function prepareSourceSearch(page: Page, location: string, serviceType: 'Domestic' | 'Commercial') {
    await waitForSourceSearchControl(page);
    const field = page.locator('#WidgetSearchTerm');
    await field.fill(location);
    await page.locator(`#${serviceType}Search`).check();
    await dismissVisibleSourceDialogs(page);
    if (await field.inputValue() !== location) await field.fill(location);
}

/**
 * Activate the verified submit button without making Playwright wait for the
 * browser's full load event. The register can redirect the POST while some
 * third-party resource remains pending; Playwright's normal click then times
 * out even though the navigation itself has already happened.
 */
export async function submitSourceSearch(page: Page) {
    await dismissVisibleSourceDialogs(page);
    // Dispatching the verified native control preserves its submit handlers
    // and form validation while allowing the caller to observe navigation
    // independently from Playwright's full-load wait.
    await (await sourceSearchButton(page)).dispatchEvent('click');
}

/** Switch the shared home-page widget to registration/name checking before searching. */
export async function prepareSourceLookup(page: Page, registrationNumber: string) {
    // Consent may replace/reset the form. Resolve any late banner before
    // switching modes or filling the shared search field.
    await waitForSourceSearchControl(page);
    const checkMode = page.locator('#optCheck');
    if (!await checkMode.count()) throw new Error('SOURCE_CHECK_MODE_NOT_FOUND');
    const checkLabel = page.locator('label[for="optCheck"]').first();
    if (await checkLabel.count() && await checkLabel.isVisible()) await checkLabel.click();
    else if (await checkMode.isVisible()) await checkMode.check();
    else await page.getByText('Check', { exact: true }).last().click();
    if (!await checkMode.isChecked()) throw new Error('SOURCE_CHECK_MODE_NOT_SELECTED');
    const field = page.locator('#WidgetSearchTerm');
    await field.fill(registrationNumber);
    await dismissVisibleSourceDialogs(page);
    if (await field.inputValue() !== registrationNumber) throw new Error('SOURCE_REGISTRATION_VALUE_NOT_SET');
    await waitForSourceSearchControl(page);
}
