import { load } from 'cheerio';
import type { Page } from 'playwright';

export function sourceContentReady(html: string, kind: 'search' | 'detail') {
    const $ = load(html);
    $('script,style,noscript').remove();
    const selector = kind === 'search' ? '.buscard,[data-testid="registrationNumber"]'
        : '.buscard,.show-engineers,#DomesticTable,#CommercialTable';
    return $(selector).length > 0 || /Multiple matches were found|no (?:registered )?(?:businesses|business|engineers|results|matches) (?:were |was )?found|Showing\s+0\s+to\s+0\s+of\s+0|request unsuccessful|access denied/i.test($.root().text());
}

/** Poll from Node: renderer requestAnimationFrame polling can stall in a headed cloud browser. */
export async function waitForSourceContent(page: Pick<Page, 'content' | 'isClosed'>, kind: 'search' | 'detail', timeoutMillis = 30000) {
    const deadline = Date.now() + timeoutMillis;
    do {
        if (page.isClosed()) throw new Error('BROWSER_CLOSED');
        const html = await page.content().catch(() => ''); // A navigation can replace the execution context.
        if (sourceContentReady(html, kind)) return;
        await new Promise<void>((resolve) => { setTimeout(resolve, 250); });
    } while (Date.now() < deadline);
    throw new Error(kind === 'search' ? 'SOURCE_SEARCH_DID_NOT_RETURN_RESULTS' : 'SOURCE_CONTENT_DID_NOT_LOAD');
}
