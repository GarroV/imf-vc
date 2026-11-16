// Проверка, что ссылки из карточек хаба живые: адрес продукта, вторые двери (боты), демо.
//   npm run check:links
// Ссылка считается живой, если отвечает кодом ниже 400 (редирект на вход — это норма).
// Хотя бы одна мёртвая — выход с кодом 1 и список причин. По расписанию гоняет
// .github/workflows/links.yml: упавший прогон краснеет, список мёртвых ссылок — в сводке прогона.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const DIR = 'src/content/projects';
const TIMEOUT_MS = 15000;
const ATTEMPTS = 2;

/** @returns {{ project: string, kind: string, url: string }[]} */
function collectLinks() {
  const links = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.yaml')).sort()) {
    const p = parse(readFileSync(join(DIR, file), 'utf8'));
    const project = p.name ?? file;
    if (p.link?.url) links.push({ project, kind: 'ссылка', url: p.link.url });
    for (const extra of p.extra_links ?? []) if (extra?.url) links.push({ project, kind: 'вторая дверь', url: extra.url });
    if (typeof p.demo === 'object' && p.demo?.url) links.push({ project, kind: 'демо', url: p.demo.url });
  }
  return links;
}

/** @param {string} url */
async function probe(url) {
  let last = '';
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status >= 400) {
        last = `HTTP ${res.status}`;
        continue;
      }
      // t.me отвечает 200 и на несуществующего бота: живого выдаёт только заголовок страницы.
      if (new URL(url).hostname === 't.me') {
        const html = await res.text();
        if (!html.includes('tgme_page_title')) {
          last = 'Telegram: такого бота нет (страница без заголовка)';
          continue;
        }
      }
      return { ok: true, detail: String(res.status) };
    } catch (e) {
      last = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
  }
  return { ok: false, detail: last };
}

const links = collectLinks();
if (links.length === 0) {
  console.error(`✗ в ${DIR} не найдено ни одной ссылки — проверять нечего, это поломка, а не успех`);
  process.exit(1);
}

const dead = [];
for (const l of links) {
  const r = await probe(l.url);
  // Ключи демо в адресе не печатаем целиком: лог CI публичный.
  const shown = l.url.replace(/([?&]key=)[^&]+/, '$1…');
  console.log(`${r.ok ? '✓' : '✗'} ${l.project} · ${l.kind} · ${shown} — ${r.detail}`);
  if (!r.ok) dead.push({ ...l, shown, detail: r.detail });
}

if (dead.length > 0) {
  console.error(`\nМёртвых ссылок: ${dead.length} из ${links.length}. Обновите карточку проекта в ${DIR}.`);
  process.exit(1);
}
console.log(`\nВсе ссылки живы: ${links.length}.`);
