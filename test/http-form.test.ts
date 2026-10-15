import { describe, expect, it } from 'vitest';
import { searchForm } from '../src/http-probe.js';

describe('observed form submission', () => {
    const html = '<form id="FindAndCheckForm" action="/search" method="post"><input name="token" value="opaque"><input id="WidgetSearchTerm" name="term"><input id="DomesticSearch" type="radio" name="service" value="Domestic" checked><input id="CommercialSearch" type="radio" name="service" value="Commercial"><input id="optFind" name="mode" value="find" type="radio" checked></form>';
    it('uses source field names, hidden state, and requested category', () => {
        expect(searchForm(html, 'CB1 1JY', 'Commercial')).toEqual({ url: 'https://www.gassaferegister.co.uk/search', method: 'POST',
            fields: { token: 'opaque', term: 'CB1 1JY', service: 'Commercial', mode: 'find' } });
    });
    it('rejects external form actions and unknown forms', () => {
        expect(() => searchForm(html.replace('/search', 'https://evil.invalid/'), 'Cambridge', 'Domestic')).toThrow();
        expect(() => searchForm('<html></html>', 'Cambridge', 'Domestic')).toThrow('SOURCE_FORM_UNRECOGNIZED');
    });
});
