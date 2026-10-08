import { expect, test } from '@playwright/test';
import { FIXTURE_TITLES } from '../fixtures/roadmap';
import { ru } from '../../src/i18n/ru';
import { en } from '../../src/i18n/en';
import { serveFixture, serveOutage, type Outage } from './helpers';

const PROJECTS = ['decimus', 'meridius', 'maximus', 'construction-bot', 'swarm'];

test.describe('с фикстурой плана', () => {
  test.beforeEach(async ({ page }) => {
    await serveFixture(page);
  });

  test(`главная рендерит ${PROJECTS.length} плиток`, async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
    await page.goto('./');
    const tiles = page.locator('a.tile');
    await expect(tiles).toHaveCount(PROJECTS.length);
    for (const slug of PROJECTS) await expect(page.locator(`#tile-${slug}`)).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('[data-roadmap="decimus"]')).toHaveAttribute('data-state', 'ready');
    // Общей ленты на главной нет: план живёт только в карточке проекта.
    await expect(page.locator('[data-roadmap="all"]')).toHaveCount(0);
    // Ни ошибок скрипта, ни нарушений CSP.
    expect(problems).toEqual([]);
  });

  test('карточка открывается, показывает ссылку и закрывается', async ({ page }) => {
    await page.goto('./');
    await page.locator('#tile-decimus').click();
    const card = page.locator('#card-decimus');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: 'Decimus', level: 2 })).toBeVisible();
    await expect(card.locator('[data-link]')).toHaveText('https://decimus.vasiliy-garro.workers.dev');
    await expect(card.getByRole('link', { name: ru.open + ' админку' })).toHaveAttribute(
      'href',
      'https://decimus.vasiliy-garro.workers.dev',
    );
    await expect(page).toHaveURL(/#decimus$/);
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    await expect(page).not.toHaveURL(/#decimus/);
  });

  test('прямая ссылка на карточку открывает её', async ({ page }) => {
    await page.goto('./#meridius');
    await expect(page.locator('#card-meridius')).toBeVisible();
    await expect(page.locator('#card-meridius [data-link]')).toHaveText('https://meridius.vasiliy-garro.workers.dev');
  });

  test('у проекта без доски в Swarm нет плана, «уточняется» не осталось', async ({ page }) => {
    await page.goto('./#construction-bot');
    const card = page.locator('#card-construction-bot');
    await expect(card).toContainText(ru.planNone);
    // Все факты найдены: ни одна карточка не говорит «уточняется».
    await expect(page.locator('[data-pending]')).toHaveCount(0);
  });

  test('приватный репозиторий без ссылки, публичный — ссылкой на GitHub', async ({ page }) => {
    await page.goto('./#construction-bot');
    const priv = page.locator('#card-construction-bot [data-repo]');
    await expect(priv).toHaveText(ru.repoPrivate);
    await expect(priv.locator('a')).toHaveCount(0);
    await expect(page.locator('#card-construction-bot')).not.toContainText('GarroV/construction_bot');
    await page.keyboard.press('Escape');

    await page.goto('./#swarm');
    await expect(page.locator('#card-swarm [data-repo] a')).toHaveAttribute('href', 'https://github.com/GarroV/Swarm-brain');
  });

  test('бот — второй ссылкой рядом с вебом', async ({ page }) => {
    await page.goto('./#decimus');
    const extra = page.locator('#card-decimus [data-extra-link]');
    await expect(extra.getByRole('link', { name: 'Открыть бота' })).toHaveAttribute('href', 'https://t.me/dodo_as_bot');
    await page.goto('./#swarm');
    await expect(page.locator('#card-swarm [data-link]')).toHaveText('https://swarm-brain.pages.dev');
    await expect(page.locator('#card-swarm [data-extra-link] a')).toHaveAttribute('href', 'https://t.me/swarm_brain_bot');
    await expect(page.locator('#card-swarm').getByRole('link', { name: ru.demoOpen })).toHaveAttribute(
      'href',
      /^https:\/\/swarm-brain\.pages\.dev\/api\/auth\/demo\?key=/,
    );
  });

  test('RU/EN переключается', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.locator('h1')).toContainText(ru.heroTitle);
    await expect(page.getByRole('link', { name: ru.langName })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('link', { name: en.langName }).click();
    await expect(page).toHaveURL(/\/imf-vc\/en\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toContainText(en.heroTitle);
    await expect(page.locator('#tile-decimus')).toContainText(en.status.build);
    await page.locator('#tile-decimus').click();
    await expect(page.locator('#card-decimus')).toContainText(en.howToEnter);
    await expect(page.locator('#card-decimus')).toContainText('Ask the project owner');
    await page.locator('#card-decimus [data-close]').click();

    await page.getByRole('link', { name: ru.langName }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.locator('h1')).toContainText(ru.heroTitle);
  });

  test('план в карточке: в работе, дальше, выкачено за 30 дней — только своего проекта', async ({ page }) => {
    await page.goto('./');
    await page.locator('#tile-decimus').click();
    const decimus = page.locator('#card-decimus [data-roadmap="decimus"]');
    await expect(decimus).toHaveAttribute('data-state', 'ready');
    await expect(decimus).toBeVisible();
    await expect(decimus.locator('[data-group="inProgress"]')).toContainText(FIXTURE_TITLES.decimusInProgress);
    await expect(decimus.locator('[data-group="planned"]')).toContainText(FIXTURE_TITLES.decimusPlanned);
    await expect(decimus.locator('[data-group="shipped"]')).toContainText(FIXTURE_TITLES.decimusShipped);
    await expect(decimus).not.toContainText(FIXTURE_TITLES.decimusShippedOld);
    await expect(decimus).not.toContainText(FIXTURE_TITLES.meridiusInProgress);
    await page.keyboard.press('Escape');

    await page.locator('#tile-meridius').click();
    await expect(page.locator('#card-meridius [data-roadmap="meridius"] [data-group="inProgress"]')).toContainText(
      FIXTURE_TITLES.meridiusInProgress,
    );
    await page.keyboard.press('Escape');

    await page.locator('#tile-maximus').click();
    await expect(page.locator('#card-maximus [data-roadmap="maximus"] [data-group="planned"]')).toContainText(
      FIXTURE_TITLES.maximusPlanned,
    );
  });

  test('порядок: сверху работающие (Swarm крупно), снизу проекты в разработке одинаковыми плитками', async ({ page }) => {
    await page.goto('./');
    const ids = await page.locator('a.tile').evaluateAll((els) => els.map((e) => e.id.replace('tile-', '')));
    expect(ids).toEqual(['swarm', 'construction-bot', 'decimus', 'meridius', 'maximus']);
    await expect(page.locator('#tile-swarm')).toHaveClass(/\blg\b/);
    for (const slug of ['decimus', 'meridius', 'maximus']) await expect(page.locator(`#tile-${slug}`)).toHaveClass(/\bsm\b/);
  });

  test('bento без дыр: каждый ряд плиток заполнен до края', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./');
    const rows = await page.evaluate(() => {
      const grid = document.querySelector('a.tile')!.parentElement!.getBoundingClientRect();
      const byRow = new Map<number, number>();
      for (const t of document.querySelectorAll('a.tile')) {
        const r = t.getBoundingClientRect();
        const top = Math.round(r.top);
        byRow.set(top, Math.max(byRow.get(top) ?? 0, r.right));
      }
      return [...byRow.values()].map((right) => Math.round(grid.right - right));
    });
    // Правый край последней плитки каждого ряда совпадает с краем сетки.
    for (const gap of rows) expect(Math.abs(gap)).toBeLessThanOrEqual(1);
  });

  test('нет горизонтального скролла', async ({ page }) => {
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('./#decimus');
      await page.locator('#card-decimus').waitFor();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `ширина ${width}`).toBeLessThanOrEqual(0);
    }
  });

  test('reduced-motion выключает анимации', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./#decimus');
    const anim = await page
      .locator('#card-decimus .sheet')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe('none');
  });

  test('клавиатура: плитка открывается Enter, фокус уходит в карточку', async ({ page }) => {
    await page.goto('./');
    await page.locator('#tile-meridius').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#card-meridius')).toBeVisible();
    const inside = await page.evaluate(() => !!document.activeElement?.closest('#card-meridius'));
    expect(inside).toBe(true);
  });
});

test.describe('эндпоинт плана недоступен', () => {
  const outages: Outage[] = ['network', 'http-500', 'http-404', 'bad-json', 'contract'];
  for (const kind of outages) {
    test(`${kind}: видно «план временно недоступен», плитки и карточки на месте`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await serveOutage(page, kind);
      await page.goto('./');
      await expect(page.locator('a.tile')).toHaveCount(PROJECTS.length);

      await page.locator('#tile-decimus').click();
      await expect(page.locator('[data-roadmap="decimus"] [data-plan-status]')).toHaveText(ru.planUnavailable);
      await expect(page.locator('[data-roadmap="decimus"]')).toHaveAttribute('data-state', 'unavailable');
      await expect(page.locator('#card-decimus [data-link]')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test('английская версия тоже честно говорит о недоступности', async ({ page }) => {
    await serveOutage(page, 'network');
    await page.goto('./en/');
    await page.locator('#tile-decimus').click();
    await expect(page.locator('[data-roadmap="decimus"] [data-plan-status]')).toHaveText(en.planUnavailable);
  });
});
