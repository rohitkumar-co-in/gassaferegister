import { describe, it, expect } from 'vitest';
import { classifyError, isRetryableVisitError } from '../src/errors.js';

describe('safe failure diagnostics', () => {
    it('keeps certificate error codes and removes credential-bearing URLs', () => {
        const result = classifyError(new Error('page.goto: net::ERR_CERT_AUTHORITY_INVALID at https://secret@example.invalid/?token=private'));
        expect(result).toBe('TRANSPORT_ERR_CERT_AUTHORITY_INVALID');
        expect(result).not.toContain('secret');
        expect(result).not.toContain('private');
    });
    it('does not expose unexpected error contents', () => {
        expect(classifyError(new Error('password=secret'))).toBe('PROBE_FAILED');
        expect(classifyError(new Error('SOURCE_BLOCKED'))).toBe('SOURCE_BLOCKED');
        expect(classifyError(new Error('locator.count: Target crashed'))).toBe('BROWSER_CRASHED');
    });
    it('retries only transient transport failures, never source blocks or validation errors', () => {
        expect(isRetryableVisitError(new Error('page.goto: net::ERR_CONNECTION_RESET'))).toBe(true);
        expect(isRetryableVisitError(Object.assign(new Error('navigation timeout'), { name: 'TimeoutError' }))).toBe(true);
        expect(isRetryableVisitError(new Error('SOURCE_BLOCKED'))).toBe(false);
        expect(isRetryableVisitError(new Error('SOURCE_LAYOUT_CHANGED'))).toBe(false);
        expect(isRetryableVisitError(new Error('NETWORK_REQUEST_LIMIT'))).toBe(false);
    });
});
