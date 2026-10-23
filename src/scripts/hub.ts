// Поведение страницы: карточки поверх страницы, копирование ссылки и шагов входа и лента плана.
// DOM строится через textContent — заголовки задач приходят извне.
import { fetchRoadmap, groupItems, parseRoadmap, type Grouped, type RoadmapResult } from '../lib/roadmap';
import { readConfig, type HubConfig } from './config';

const PLANNED_LIMIT_CARD = 5;

const config = readConfig();

// ---------- карточки ----------

function dialogFor(slug: string): HTMLDialogElement | null {
  const el = document.getElementById(`card-${slug}`);
  return el instanceof HTMLDialogElement ? el : null;
}

function openFromHash(): void {
  const slug = decodeURIComponent(location.hash.slice(1));
  const dialog = slug ? dialogFor(slug) : null;
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((d) => {
    if (d !== dialog) d.close();
  });
  if (dialog && !dialog.open) dialog.showModal();
}

function clearHash(): void {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function wireDialogs(): void {
  document.querySelectorAll<HTMLDialogElement>('dialog.card').forEach((dialog) => {
    dialog.addEventListener('close', clearHash);
    // Клик по подложке (вне листа) закрывает карточку.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
  });
  document.querySelectorAll<HTMLAnchorElement>('a.tile').forEach((tile) => {
    tile.addEventListener('click', (e) => {
      e.preventDefault();
      history.pushState(null, '', tile.hash);
      openFromHash();
    });
  });
  window.addEventListener('hashchange', openFromHash);
  window.addEventListener('popstate', openFromHash);
  openFromHash();
}

function wireCopy(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.copy ?? '';
      const status = btn.parentElement?.querySelector<HTMLElement>('[data-copy-status]');
      try {
        await navigator.clipboard.writeText(url);
        if (status) status.textContent = config.i18n.copied;
      } catch {
        const isSteps = btn.dataset.copyFail === 'steps';
        const target = btn.closest('section')?.querySelector(isSteps ? 'ol.steps' : '.url');
        if (target) getSelection()?.selectAllChildren(target);
        if (status) status.textContent = isSteps ? config.i18n.copyStepsFailed : config.i18n.copyFailed;
      }
    });
  });
}

// ---------- план ----------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(ymd: string): string {
  return new Intl.DateTimeFormat(config.lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${ymd}T00:00:00Z`),
  );
}

const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');

type GroupKey = keyof Grouped;
const GROUPS: readonly GroupKey[] = ['inProgress', 'planned', 'shipped'];

function stageText(key: GroupKey, due: string | null, shippedAt: string | null): string {
  const i = config.i18n;
  if (key === 'shipped') return shippedAt ? fill(i.shippedOn, { date: formatDate(shippedAt) }) : i.stateShipped;
  if (key === 'planned') return due ? fill(i.dueOn, { date: formatDate(due) }) : i.statePlanned;
  return due ? fill(i.dueOn, { date: formatDate(due) }) : i.stateInProgress;
}

interface Row {
  projectName?: string;
  title: string;
  stage: string;
}

function fillGroup(container: HTMLElement, key: GroupKey, rows: readonly Row[]): void {
  const list = container.querySelector<HTMLElement>(`[data-group="${key}"] [data-rows]`);
  if (!list) return;
  list.replaceChildren();
  if (rows.length === 0) {
    list.append(el('li', 'row is-empty', config.i18n.planEmpty));
    return;
  }
  for (const r of rows) {
    const li = el('li', 'row');
    if (r.projectName) li.append(el('span', 'proj', r.projectName));
    li.append(el('span', 'what', r.title), el('span', `stage stage-${key}`, r.stage));
    list.append(li);
  }
}

function setStatus(container: HTMLElement, state: 'loading' | 'ready' | 'unavailable', text: string): void {
  container.dataset.state = state;
  const status = container.querySelector<HTMLElement>('[data-plan-status]');
  if (status) status.textContent = text;
}

function renderUnavailable(containers: readonly HTMLElement[]): void {
  for (const c of containers) setStatus(c, 'unavailable', config.i18n.planUnavailable);
}

function renderPlan(result: RoadmapResult & { ok: true }, containers: readonly HTMLElement[]): void {
  const now = new Date();
  const byId = new Map(result.roadmap.projects.map((p) => [p.id, p.items]));
  const updated = result.roadmap.generatedAt
    ? fill(config.i18n.planUpdated, {
        datetime: new Intl.DateTimeFormat(config.lang, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(result.roadmap.generatedAt),
        ),
      })
    : '';

  for (const c of containers) {
    const slug = c.dataset.roadmap;
    const targets = config.projects.filter((p) => p.swarmId && p.slug === slug);
    const rows: Record<GroupKey, Row[]> = { inProgress: [], planned: [], shipped: [] };
    for (const p of targets) {
      const grouped = groupItems(byId.get(p.swarmId!.toLowerCase()) ?? [], now, PLANNED_LIMIT_CARD);
      for (const key of GROUPS) {
        for (const item of grouped[key]) {
          rows[key].push({
            title: item.title,
            stage: stageText(key, item.due, item.shippedAt),
          });
        }
      }
    }
    for (const key of GROUPS) fillGroup(c, key, rows[key]);
    setStatus(c, 'ready', updated);
  }
}

async function loadRoadmap(cfg: HubConfig): Promise<RoadmapResult> {
  if (import.meta.env.DEV && !import.meta.env.PUBLIC_ROADMAP_URL) {
    // В dev — фикстура, чтобы не зависеть от выдачи Swarm. В прод-сборку не попадает.
    const { buildRoadmapFixture } = await import('../../tests/fixtures/roadmap');
    const roadmap = parseRoadmap(buildRoadmapFixture(new Date()));
    return roadmap ? { ok: true, roadmap } : { ok: false, reason: 'fixture' };
  }
  return fetchRoadmap(cfg.roadmapUrl);
}

async function wirePlan(): Promise<void> {
  const containers = [...document.querySelectorAll<HTMLElement>('[data-roadmap]')];
  if (containers.length === 0) return;
  for (const c of containers) setStatus(c, 'loading', config.i18n.planLoading);
  const result = await loadRoadmap(config);
  if (!result.ok) {
    console.warn(`[hub] roadmap unavailable: ${result.reason}`);
    renderUnavailable(containers);
    return;
  }
  renderPlan(result, containers);
}

wireDialogs();
wireCopy();
void wirePlan();
