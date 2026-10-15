/** Runs in the browser. Mirrors the observed /tpv -> native form workflow. */
export async function submitValidatedForm() {
    const form = document.querySelector('#FindAndCheckForm');
    if (!(form instanceof HTMLFormElement)) throw new Error('SOURCE_LAYOUT_CHANGED: missing search form');
    const action = new URL(form.action);
    const validation = new URL(form.dataset.validationurl ?? '', window.location.href);
    if (form.method.toLowerCase() !== 'post' || action.origin !== window.location.origin || action.pathname !== '/widgetfc'
        || validation.origin !== window.location.origin || validation.pathname !== '/tpv') throw new Error('SOURCE_LAYOUT_CHANGED: unexpected search endpoints');
    const token = form.querySelector<HTMLInputElement>('input[name="__RequestVerificationToken"]')?.value;
    if (!token) throw new Error('SOURCE_FORM_TOKEN_MISSING');
    const body = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
        if (typeof value !== 'string') throw new Error('SOURCE_LAYOUT_CHANGED: unexpected form upload');
        body.append(key, value);
    }
    const response = await fetch(validation.href, { method: 'POST', credentials: 'same-origin', redirect: 'error', body,
        headers: { RequestVerificationToken: token, 'X-Requested-With': 'XMLHttpRequest' } });
    if (!response.ok) throw new Error(`SOURCE_VALIDATION_HTTP_${response.status}`);
    const text = await response.text();
    if (/access denied|request unsuccessful|blocked by our security service/i.test(text)) throw new Error('SOURCE_VALIDATION_BLOCKED');
    let result: Record<string, unknown>;
    try { result = JSON.parse(text) as Record<string, unknown>; } catch { throw new Error('UNRECOGNIZED_VALIDATION_RESPONSE'); }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('UNRECOGNIZED_VALIDATION_RESPONSE');
    const status = Number(result.statuscode);
    if (status === 404) throw new Error('SOURCE_LOCATION_NOT_FOUND');
    if (![200, 409].includes(status)) throw new Error('UNRECOGNIZED_VALIDATION_RESPONSE');
    for (const [id, key] of [['MatchedLocationLat', 'matchedlocationlat'], ['MatchedLocationLong', 'matchedlocationlong'],
        ['MatchedLocationID', 'matchedlocationid'], ['MatchedLocation', 'matchedlocation']]) {
        const field = form.querySelector<HTMLInputElement>(`#${id}`);
        const value = result[key!];
        if (field && (typeof value === 'string' || typeof value === 'number')) field.value = String(value);
    }
    HTMLFormElement.prototype.submit.call(form);
}
