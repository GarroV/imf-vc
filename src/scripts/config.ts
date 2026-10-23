// Данные, которые сервер кладёт в страницу для скрипта: язык, адрес плана,
// строки словаря и соответствие проектов подпроектам Swarm.
import type { Dict } from '../i18n/ru';

export const CLIENT_KEYS = [
  'copied',
  'copyFailed',
  'copyStepsFailed',
  'planLoading',
  'planUnavailable',
  'planEmpty',
  'planUpdated',
  'dueOn',
  'shippedOn',
  'stateInProgress',
  'statePlanned',
  'stateShipped',
] as const satisfies readonly (keyof Dict)[];

export type ClientStrings = { [K in (typeof CLIENT_KEYS)[number]]: string };

export interface HubConfig {
  lang: string;
  roadmapUrl: string;
  i18n: ClientStrings;
  projects: { slug: string; name: string; swarmId: string | null }[];
}

export const CONFIG_ELEMENT_ID = 'hub-config';

export function readConfig(): HubConfig {
  const node = document.getElementById(CONFIG_ELEMENT_ID);
  if (!node?.textContent) throw new Error('[hub] config island is missing');
  return JSON.parse(node.textContent) as HubConfig;
}
