import { mkdir, writeFile } from 'node:fs/promises';
import { load } from 'cheerio';

const sources = [
    ['zenrows', 'https://www.zenrows.com/blog/incapsula-bypass'],
    ['decodo', 'https://decodo.com/blog/imperva-bypass'],
    ['roundproxies', 'https://roundproxies.com/blog/bypass-imperva-incapsula/'],
    ['hproxy', 'https://hproxy.com/blog/how-to-scrape-past-imperva'],
    ['scrapebadger', 'https://scrapebadger.com/blog/how-to-bypass-imperva-incapsula-anti-bot-protection-complete-2026-guide'],
    ['omniscrape', 'https://www.omniscrape.io/guides/imperva-bypass'],
    ['disasm', 'https://disasm.dev/blog/how-to-bypass-reese84/'],
    ['patched-overflow', 'https://blakeellis.dev/blog/Incapsula-Cookie-Overflow-Bypass'],
    ['patchright', 'https://raw.githubusercontent.com/Kaliiiiiiiiii-Vinyzu/patchright/main/README.md'],
    ['seleniumbase', 'https://raw.githubusercontent.com/seleniumbase/SeleniumBase/master/examples/cdp_mode/ReadMe.md'],
    ['wafer', 'https://raw.githubusercontent.com/Averyy/wafer/main/README.md'],
    ['zendriver-imperva', 'https://docs.rs/zendriver-imperva/latest/zendriver_imperva/index.html'],
];
const directory = 'experiment-results/imperva-guide-review';
await mkdir(directory, { recursive: true });
const results = await Promise.allSettled(sources.map(async ([name, url]) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) return { name, url, status: response.status, readable: false };
    const raw = await response.text();
    let content = raw;
    if (/<html|<!doctype/i.test(raw)) {
        const $ = load(raw);
        $('script,style,nav,footer,header,pre,code').remove();
        const root = $('article').first().length ? $('article').first() : $('main').first();
        content = (root.length ? root : $('body')).text();
    }
    content = content.replace(/\r/g, '').replace(/[\t ]+/g, ' ').replace(/\n\s*\n+/g, '\n\n');
    await writeFile(`${directory}/${name}.txt`, content);
    const terms = /bypass|fingerprint|session|proxy|cookie|CDP|Runtime.enable|isolated|patched|limitation|not guarantee|reese84|utmvc/i;
    const paragraphs = content.split(/\n+/).map(p => p.trim()).filter(p => p.length > 45 && terms.test(p));
    return { name, url, readable: true, characters: content.length, guidance: paragraphs.slice(0, 16).map(p => p.slice(0, 350)).join('\n').slice(0, 3000) };
}));
await writeFile(`${directory}/index.json`, JSON.stringify(results, null, 2));
for (const result of results) console.log(JSON.stringify(result));
