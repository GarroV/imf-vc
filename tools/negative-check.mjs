// Проверка проверок: ломает копию проекта и требует, чтобы тесты упали.
// Если тест на «план временно недоступен» остаётся зелёным без обработки
// ошибки, он ничего не проверяет. Плюс: сборка обязана падать без поля в YAML,
// а проверка ссылок — на мёртвом адресе и на несуществующем боте.
//
//   npm run check:negative
//
// Каждая поломка применяется к временной копии; исходники не трогаются.
// Если подстановка не нашла текст — это отказ самой проверки, а не «зелёный».
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', 'dist', '.astro', 'test-results', 'playwright-report', '.git']);
const OUTAGE_TESTS = 'эндпоинт плана недоступен';

const MUTATIONS = [
  {
    name: 'страница не обрабатывает неудачный ответ',
    file: 'src/scripts/hub.ts',
    find: /  if \(!result\.ok\) \{\n[\s\S]*?\n    return;\n  \}\n/,
    replace: '',
    run: ['npx', 'playwright', 'test', '--project=desktop', '-g', OUTAGE_TESTS],
  },
  {
    name: 'сбой сети пробрасывается наружу вместо результата',
    file: 'src/lib/roadmap.ts',
    find: /  \} catch \(err\) \{\n    return \{ ok: false[^\n]*\n/,
    replace: '  } catch (err) {\n    throw err;\n',
    run: ['npx', 'playwright', 'test', '--project=desktop', '-g', OUTAGE_TESTS],
  },
  {
    name: 'ответ не сверяется с договором',
    file: 'src/lib/roadmap.ts',
    find: /    return roadmap \? \{ ok: true, roadmap \} : \{ ok: false, reason: 'contract mismatch' \};/,
    replace: "    return { ok: true, roadmap: roadmap ?? ({} as never) };",
    run: ['npx', 'playwright', 'test', '--project=desktop', '-g', 'contract:'],
  },
  {
    name: 'карточка показывает ссылку на приватный репозиторий',
    file: 'src/components/Card.astro',
    find: /p\.repo_public \?/,
    replace: 'true ?',
    run: ['npx', 'playwright', 'test', '--project=desktop', '-g', 'приватный репозиторий'],
  },
  {
    name: '«Скопировать инструкцию» копирует не шаги, а только название',
    file: 'src/components/Card.astro',
    find: /data-copy=\{stepsText\}/,
    replace: 'data-copy={p.name}',
    run: ['npx', 'playwright', 'test', '--project=desktop', '-g', 'Скопировать инструкцию'],
  },
  {
    name: 'в YAML проекта нет обязательного поля',
    file: 'src/content/projects/meridius.yaml',
    find: /^summary:\n(?:  .*\n)+/m,
    replace: '',
    run: ['npx', 'astro', 'build'],
  },
  {
    name: 'в YAML проекта нет текста на одном из языков',
    file: 'src/content/projects/decimus.yaml',
    find: /^(kind:\n  ru: .*\n)  en: .*\n/m,
    replace: '$1',
    run: ['npx', 'astro', 'build'],
  },
  {
    name: 'ссылка на бота ведёт на несуществующего бота',
    file: 'src/content/projects/construction-bot.yaml',
    find: /t\.me\/dodo_constr_bot/,
    replace: 't.me/zz_nonexistent_bot_7781234',
    run: ['node', 'tools/check-links.mjs'],
  },
  {
    name: 'адрес продукта не открывается',
    file: 'src/content/projects/swarm.yaml',
    find: /^  url: https:\/\/swarm-team\.app(?=\s)/m,
    replace: '  url: https://swarm-brain-nonexistent-9981.pages.dev',
    run: ['node', 'tools/check-links.mjs'],
  },
];

function makeCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'imf-vc-negative-'));
  cpSync(ROOT, dir, { recursive: true, filter: (src) => !SKIP.has(src.slice(ROOT.length + 1).split('/')[0]) });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  return dir;
}

let failures = 0;
MUTATIONS.forEach((m, i) => {
  const dir = makeCopy();
  try {
    const path = join(dir, m.file);
    const before = readFileSync(path, 'utf8');
    const after = before.replace(m.find, m.replace);
    if (after === before) {
      console.error(`✗ ${m.name}: поломка не применилась (${m.file} изменился?) — проверку надо обновить`);
      failures++;
      return;
    }
    writeFileSync(path, after);
    const res = spawnSync(m.run[0], m.run.slice(1), {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, CI: '', E2E_PORT: String(4340 + i) },
    });
    const out = `${res.stdout}\n${res.stderr}`;
    if (res.status === 0) {
      console.error(`✗ ${m.name}: проверка осталась зелёной на сломанной копии`);
      failures++;
    } else {
      const reason =
        out.match(/(Мёртвых ссылок.*|Error: .*|Expected.*|InvalidContentEntryDataError.*|\d+ failed)/)?.[0] ?? 'код выхода ' + res.status;
      console.log(`✓ ${m.name}: упала, как должна — ${reason.trim().slice(0, 160)}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

if (failures > 0) {
  console.error(`\n${failures} проверк(и) не ловят поломку.`);
  process.exit(1);
}
console.log('\nВсе проверки падают на сломанном входе.');
