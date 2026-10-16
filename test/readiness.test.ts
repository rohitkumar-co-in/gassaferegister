import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { sourceContentReady, waitForSourceContent } from '../src/readiness.js';

it('recognizes result pages independently of renderer animation polling', async () => {
    const html = readFileSync(new URL('../fixtures/businesses.html', import.meta.url), 'utf8');
    let calls = 0;
    await waitForSourceContent({ isClosed: () => false, async content() { calls++; return calls < 2 ? '<body>Loading</body>' : html; } }, 'search', 1000);
    expect(calls).toBe(2);
    expect(sourceContentReady('<script>const text="no results found"</script><body>Loading</body>', 'search')).toBe(false);
    expect(sourceContentReady('<body>No registered businesses were found</body>', 'search')).toBe(true);
    expect(sourceContentReady('<body>Multiple matches were found</body>', 'search')).toBe(true);
    for (const name of ['engineers.html', 'qualifications.html']) {
        expect(sourceContentReady(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'), 'detail')).toBe(true);
    }
});

it('never accepts an unfinished page as an empty result', async () => {
    await expect(waitForSourceContent({ isClosed: () => false, async content() { return '<body>Loading</body>'; } }, 'search', 1))
        .rejects.toThrow('SOURCE_SEARCH_DID_NOT_RETURN_RESULTS');
});
