import { describe, expect, it } from 'vitest';

import { parseSourceCookies } from '../src/cookies.js';

const cookie = { domain: '.gassaferegister.co.uk', name: 'session', value: 'synthetic-secret', path: '/', httpOnly: true, secure: true, sameSite: 'no_restriction', expirationDate: 2000 };
describe('private source cookie import', () => {
    it('maps browser export attributes and preserves HttpOnly', () => {
        expect(parseSourceCookies(JSON.stringify([cookie]), 1000)).toEqual([{ domain: cookie.domain, name: cookie.name, value: cookie.value, path: '/', httpOnly: true, secure: true, sameSite: 'None', expires: 2000 }]);
    });
    it('rejects other domains without exposing values', () => {
        expect(() => parseSourceCookies(JSON.stringify([{ ...cookie, domain: '.example.com' }]), 1000)).toThrow('Invalid source cookie domain');
    });
    it('skips expired cookies but accepts browser session cookies', () => {
        expect(parseSourceCookies(JSON.stringify([cookie, { ...cookie, name: 'active', expirationDate: undefined, session: true }]), 3000)).toHaveLength(1);
        expect(() => parseSourceCookies(JSON.stringify([cookie]), 3000)).toThrow('no unexpired cookies');
    });
    it('does not echo malformed JSON in the error', () => {
        expect(() => parseSourceCookies('synthetic-secret')).toThrow('Invalid source cookie JSON');
    });
});
