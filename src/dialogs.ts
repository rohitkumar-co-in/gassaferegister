import type { Page } from 'playwright';

/** Handle source dialogs even when they arrive after initial page loading. */
export async function installSourceDialogHandlers(page: Page, onDismiss: () => void | Promise<void>, onFailure: (error: unknown) => void = () => { /* Optional diagnostic hook. */ }) {
    const cookies = page.getByRole('button', { name: 'Allow all cookies', exact: true });
    await page.addLocatorHandler(cookies, async () => {
        try {
            await cookies.click();
            await cookies.waitFor({ state: 'hidden', timeout: 5000 });
            await onDismiss();
        } catch (error) { onFailure(error); }
    }, { times: 1 });
    const survey = page.getByRole('button', { name: 'No - do not take the user satisfaction survey', exact: true });
    await page.addLocatorHandler(survey, async () => {
        try {
            await survey.click();
            await survey.waitFor({ state: 'hidden', timeout: 5000 });
            await onDismiss();
        } catch (error) { onFailure(error); }
    }, { times: 1 });
}
