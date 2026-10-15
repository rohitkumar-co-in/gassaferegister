import { describe, expect, it } from 'vitest';
import { allowedCertificateExceptionUrl, validateInput } from '../src/config.js';

describe('certificate exception boundaries', () => {
    it('keeps certificate validation enabled by default', () => {
        expect(validateInput({}).allowUnblockerCertificateException).toBe(false);
    });
    it('rejects exceptions outside a live Unblocker probe', () => {
        expect(() => validateInput({ allowUnblockerCertificateException: true })).toThrow();
        expect(() => validateInput({ mode: 'probe', useUkResidentialProxy: true, proxyService: 'residential', allowUnblockerCertificateException: true })).toThrow();
    });
    it('restricts exceptional requests to HTTPS on the two exact source hosts', () => {
        expect(allowedCertificateExceptionUrl('https://www.gassaferegister.co.uk/findbusinessresults?ep=test')).toBe(true);
        for (const url of ['http://www.gassaferegister.co.uk/', 'https://www.gassaferegister.co.uk.evil.invalid/',
            'https://gassaferegister.co.uk:444/', 'https://secret@gassaferegister.co.uk/', 'https://other.invalid/', 'wss://www.gassaferegister.co.uk/']) {
            expect(allowedCertificateExceptionUrl(url)).toBe(false);
        }
    });
});
