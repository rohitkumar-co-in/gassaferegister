/** Keep browser error codes without copying URLs or credentials into logs. */
export function classifyError(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return 'TRANSPORT_TIMEOUT';
    const networkCode = message.match(/\b(?:NET::)?(ERR_[A-Z_]+)\b/);
    if (networkCode) return `TRANSPORT_${networkCode[1]}`;
    if (/^(SOURCE_|UNRECOGNIZED_|PROXY_|Invalid|RUNTIME_LIMIT|TRANSFER_LIMIT|NETWORK_REQUEST_LIMIT|USER_MAX_CHARGE)/.test(message)) return message.split('\n')[0]!.slice(0, 160);
    return 'PROBE_FAILED';
}

/** Retry only idempotent page visits that failed for a narrow, transient transport reason. */
export function isRetryableVisitError(error: unknown): boolean {
    const code = classifyError(error);
    return [
        'TRANSPORT_TIMEOUT',
        'TRANSPORT_ERR_CONNECTION_RESET',
        'TRANSPORT_ERR_CONNECTION_CLOSED',
        'TRANSPORT_ERR_NETWORK_CHANGED',
        'TRANSPORT_ERR_TIMED_OUT',
    ].includes(code);
}
