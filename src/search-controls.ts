import type { Page } from 'playwright';

/** Prefer the user-verified label; retain support for older unlabelled markup. */
export function sourceSearchButton(page: Page) {
    const form = page.locator('#FindAndCheckForm');
    return form.locator('button[type="submit"][aria-label="Search"]')
        .or(form.getByRole('button', { name: /^\s*Search(?:\s|$)/ }));
}

/** Resolve blocking dialogs before entering values that consent may clear. */
export async function prepareSourceSearch(page: Page, location: string, serviceType: 'Domestic' | 'Commercial') {
    await sourceSearchButton(page).click({ trial: true });
    const field = page.locator('#WidgetSearchTerm');
    await field.fill(location);
    await page.locator(`#${serviceType}Search`).check();
    if (await field.inputValue() !== location) await field.fill(location);
}
