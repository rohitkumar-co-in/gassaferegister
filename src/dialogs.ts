import type { Frame, Page } from 'playwright';

type DialogHandlers = { onDismiss: () => void | Promise<void>; onFailure: (error: unknown) => void };
const handlers = new WeakMap<Page, DialogHandlers>();
const dialogNames = ['Allow all cookies', 'No - do not take the user satisfaction survey'] as const;

/** Register callbacks for dialogs that can appear in the page or a child frame. */
export async function installSourceDialogHandlers(page: Page, onDismiss: () => void | Promise<void>, onFailure: (error: unknown) => void = () => { /* Optional diagnostic hook. */ }) {
    const callbacks = { onDismiss, onFailure };
    handlers.set(page, callbacks);
    for (const name of dialogNames) {
        const button = page.getByRole('button', { name, exact: true });
        await page.addLocatorHandler(button, async () => {
            try {
                await button.click();
                await button.waitFor({ state: 'hidden', timeout: 5000 });
                await callbacks.onDismiss();
            } catch (error) { callbacks.onFailure(error); }
        }, { times: 1 });
    }
}

/** Explicitly clear visible source dialogs before a form action; dialogs may live in iframes. */
export async function dismissVisibleSourceDialogs(page: Page): Promise<void> {
    const callbacks = handlers.get(page);
    if (!callbacks) return;
    for (const frame of page.frames()) {
        // Main-frame prompts are handled by Playwright's action-aware handler above.
        if (frame === page.mainFrame()) continue;
        for (const name of dialogNames) {
            const button = dialogButton(frame, name);
            if (!await button.isVisible().catch(() => false)) continue;
            try {
                await button.click({ timeout: 5000 });
                await button.waitFor({ state: 'hidden', timeout: 5000 });
                await callbacks.onDismiss();
            } catch (error) {
                callbacks.onFailure(error);
            }
        }
    }
}

function dialogButton(frame: Frame, name: string) {
    return frame.getByRole('button', { name, exact: true }).first();
}
