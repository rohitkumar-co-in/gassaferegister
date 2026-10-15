import type { Page } from 'playwright';

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

/** Resolve blocking dialogs before entering values that consent may clear. */
export async function prepareSourceSearch(page: Page, location: string, serviceType: 'Domestic' | 'Commercial') {
    await (await sourceSearchButton(page)).click({ trial: true });
    const field = page.locator('#WidgetSearchTerm');
    await field.fill(location);
    await page.locator(`#${serviceType}Search`).check();
    if (await field.inputValue() !== location) await field.fill(location);
}

/** Switch the shared home-page widget to registration/name checking before searching. */
export async function prepareSourceLookup(page: Page, registrationNumber: string) {
    // Consent may replace/reset the form. Resolve any late banner before
    // switching modes or filling the shared search field.
    await (await sourceSearchButton(page)).click({ trial: true });
    const checkMode = page.locator('#optCheck');
    if (!await checkMode.count()) throw new Error('SOURCE_CHECK_MODE_NOT_FOUND');
    await checkMode.check();
    const field = page.locator('#WidgetSearchTerm');
    await field.fill(registrationNumber);
    if (await field.inputValue() !== registrationNumber) throw new Error('SOURCE_REGISTRATION_VALUE_NOT_SET');
    await (await sourceSearchButton(page)).click({ trial: true });
}
