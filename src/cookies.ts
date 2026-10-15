import type { BrowserContext } from 'playwright';

type Cookies = Parameters<BrowserContext['addCookies']>[0][number][];

/** Import only first-party Gas Safe cookies; never include supplied values in errors. */
export function parseSourceCookies(json: string, nowSeconds = Date.now() / 1000): Cookies {
    let raw: unknown;
    try { raw = JSON.parse(json); } catch { throw new Error('Invalid source cookie JSON'); }
    if (!Array.isArray(raw) || raw.length > 100) throw new Error('Invalid source cookie list');
    const cookies: Cookies = [];
    for (const value of raw) {
        if (!value || typeof value !== 'object') throw new Error('Invalid source cookie');
        const c = value as Record<string, unknown>;
        if (typeof c.domain !== 'string' || !['gassaferegister.co.uk', 'www.gassaferegister.co.uk'].includes(c.domain.replace(/^\./, '')))
            throw new Error('Invalid source cookie domain');
        if (typeof c.name !== 'string' || !c.name || typeof c.value !== 'string'
            || typeof c.path !== 'string' || !c.path.startsWith('/') || /[\r\n\0]/.test(c.name + c.value + c.path))
            throw new Error('Invalid source cookie fields');
        const expiry = c.expirationDate ?? c.expires;
        if (expiry !== undefined && (typeof expiry !== 'number' || !Number.isFinite(expiry))) throw new Error('Invalid source cookie expiry');
        if (typeof expiry === 'number' && expiry > 0 && expiry <= nowSeconds) continue;
        const sameSite = typeof c.sameSite === 'string' ? c.sameSite.toLowerCase() : 'unspecified';
        if (!['strict', 'lax', 'none', 'no_restriction', 'unspecified'].includes(sameSite)) throw new Error('Invalid source cookie SameSite');
        const mappedSameSite = ({ strict: 'Strict', lax: 'Lax', none: 'None', no_restriction: 'None' } as const)[sameSite as 'strict' | 'lax' | 'none' | 'no_restriction'];
        cookies.push({ name: c.name, value: c.value, domain: c.domain, path: c.path,
            httpOnly: c.httpOnly === true, secure: c.secure === true,
            ...(mappedSameSite ? { sameSite: mappedSameSite } : {}),
            ...(typeof expiry === 'number' && expiry > 0 && c.session !== true ? { expires: expiry } : {}),
        });
    }
    if (!cookies.length) throw new Error('Invalid source cookies: no unexpired cookies');
    return cookies;
}
