import type { Business } from './crawler.js';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const flag = (value: boolean | null) => {
    if (value === null) return 'Not specified';
    return value ? 'Yes' : 'No';
};

export function businessDisplay(record: Business) {
    return { ...record, full_address: record.address.full_address ?? '', engineer_count: record.engineers.length,
        engineer_names: record.engineers.map((engineer) => engineer.name).join('; '), qualification_count: record.qualifications.length };
}

export function resultTables(records: Business[]) {
    return {
        businesses: records.map((b) => ({ Business: b.business_name, Registration: b.registration_number, Phone: b.telephone,
            Email: b.email, Address: b.address.full_address, Engineers: b.engineers.length, Qualifications: b.qualifications.length,
            'Extraction status': b.enrichment_status, Error: b.enrichment_error })),
        engineers: records.flatMap((b) => b.engineers.map((e) => ({ Business: b.business_name, Registration: b.registration_number,
            Engineer: e.name, Status: e.status, Phone: e.telephone, Services: e.services.join('; '),
            'Qualification status': e.qualifications_status, Error: e.error }))),
        qualifications: records.flatMap((b) => b.qualifications.map((q) => ({ Business: b.business_name, Registration: b.registration_number,
            Engineer: q.engineer_name, Category: q.category, Service: q.service, 'Natural gas': flag(q.natural_gas),
            LPG: flag(q.lpg), 'Building regulations': flag(q.building_regulations), 'Group heading': q.is_group ? 'Yes' : 'No' }))),
    };
}

export function tableCsv(rows: Record<string, unknown>[], fallbackHeaders: string[] = []) {
    const headers = rows.length ? Object.keys(rows[0]!) : fallbackHeaders;
    const cell = (v: unknown) => {
        let text = String(v ?? '');
        if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    };
    return `\uFEFF${[headers, ...rows.map((row) => headers.map((key) => row[key]))].map((row) => row.map(cell).join(',')).join('\r\n')}`;
}

export function renderReport(records: Business[], status: string, error: string | null) {
    const tables = resultTables(records);
    const section = (title: string, rows: Record<string, unknown>[]) => `<section id="${title.toLowerCase()}"><h2>${title} (${rows.length})</h2>${rows.length
        ? `<div class="scroll"><table><thead><tr>${Object.keys(rows[0]!).map((key) => `<th>${escapeHtml(key)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${Object.values(row).map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
        : '<p>No records collected for this section. Check extraction status and the selected input options.</p>'}</section>`;
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gas Safe search results</title><style>body{font:15px system-ui;color:#172033;margin:24px;background:#f5f7fa}section{background:white;padding:20px;margin:20px 0;border-radius:12px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd;vertical-align:top}th{background:#edf2f7}nav a{margin-right:20px}p{line-height:1.6}</style><h1>Gas Safe search results</h1><p>Status: <strong>${escapeHtml(status)}</strong>${error ? ` — ${escapeHtml(error)}` : ''}. ${records.length} unique businesses collected. Source results may be incomplete.</p><nav><a href="#businesses">Businesses</a><a href="#engineers">Engineers</a><a href="#qualifications">Qualifications</a></nav>${section('Businesses', tables.businesses)}${section('Engineers', tables.engineers)}${section('Qualifications', tables.qualifications)}</html>`;
}
