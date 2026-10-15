import { load } from 'cheerio';

import { officialUrl } from './parser.js';

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
const nullable = (text: string) => /^(?:n\/a|-|none)$/i.test(text) || !text ? null : text;
export interface Qualification {
    category: string;
    service: string;
    natural_gas: boolean | null;
    lpg: boolean | null;
    building_regulations: boolean | null;
    is_group: boolean;
}
export interface Engineer {
    name: string;
    services: string[];
    status: string | null;
    telephone: string | null;
    qualifications_url: string | null;
    qualifications: Qualification[];
    qualifications_status: 'not_requested' | 'succeeded' | 'failed' | 'unavailable';
    error: string | null;
}
export function assertSource(html: string) {
    const $ = load(html);
    $('script,style,noscript').remove();
    if (/access denied|blocked by our security service|request unsuccessful/i.test($.root().text())) throw new Error('SOURCE_BLOCKED');
}
export function parseEngineers(html: string) {
    assertSource(html);
    const $ = load(html);
    const engineers: Engineer[] = $('.show-engineers').toArray().map((element) => {
        const card = $(element);
        const name = clean(card.find('[data-testid="EngineerName"]').text());
        if (!name) throw new Error('SOURCE_LAYOUT_CHANGED: missing engineer name');
        // Read the literal observed navigation target, never execute onclick JavaScript.
        const onclick = card.find('button[onclick]').attr('onclick') ?? '';
        const href = /window\.location\s*=\s*(['"])(.*?)\1/.exec(onclick)?.[2];
        const statusHeading = card.find('h3').filter((_, el) => clean($(el).text()) === 'Status').first();
        let status = '';
        let node = statusHeading[0]?.nextSibling;
        while (node && !(node.type === 'tag' && node.name === 'h3')) {
            status += $(node).text();
            node = node.nextSibling;
        }
        return { name, services: card.find('[data-testid]').filter((_, el) => ($(el).attr('data-testid') ?? '').trim().startsWith('servicesProvided'))
            .toArray().map((el) => clean($(el).text())).filter(Boolean),
        status: nullable(clean(status)), telephone: nullable(clean(card.find('[data-testid="telephone"]').text())),
        qualifications_url: href ? officialUrl(href) : null, qualifications: [], qualifications_status: 'not_requested', error: null };
    });
    const text = clean($('#spinnercontainer').text());
    const total = /Showing\s+\d+\s+to\s+\d+\s+of\s+(\d+)/i.exec(text);
    if (!engineers.length && !/no (?:registered )?engineers|0 results/i.test(text)) throw new Error('UNRECOGNIZED_ENGINEERS');
    const href = $('a[data-testid="pgNext"]').attr('href');
    return { engineers, total_results: total ? Number(total[1]) : null, next_page_url: href ? officialUrl(href) : null,
        trading_name: nullable(clean($('[data-testid="tradingName"]').first().text())) };
}
export function parseQualifications(html: string): Qualification[] {
    assertSource(html);
    const $ = load(html);
    const result: Qualification[] = [];
    for (const category of ['Domestic', 'Commercial']) {
        const container = $(`#${category}Table`);
        if (!container.length) continue;
        for (const element of container.find('tbody tr').toArray()) {
            const row = $(element);
            const cells = row.find('td');
            const service = clean(cells.eq(0).text());
            if (!service || cells.length !== 4) throw new Error('SOURCE_LAYOUT_CHANGED: qualification table');
            const flag = (index: number): boolean | null => {
                const cell = cells.eq(index);
                if (cell.find('.fa-check').length) return true;
                if (cell.find('.fa-remove,.fa-times,.fa-close').length) return false;
                if (clean(cell.text())) throw new Error('SOURCE_LAYOUT_CHANGED: qualification symbol');
                return null;
            };
            result.push({ category, service, natural_gas: flag(1), lpg: flag(2), building_regulations: flag(3),
                is_group: row.hasClass('SafeBlackBackground') });
        }
    }
    if (!$('#DomesticTable,#CommercialTable').length) throw new Error('UNRECOGNIZED_QUALIFICATIONS');
    return result;
}
