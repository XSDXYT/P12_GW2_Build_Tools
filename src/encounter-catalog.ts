import catalog from "./data/encounters.json";
import type { EncounterOption } from "./components/EncounterSearch";

export const encounterCatalog = catalog.instances;
const normalize = (value: string) => value.trim().toLocaleLowerCase();
export const instanceOptions: EncounterOption[] = encounterCatalog.map(
  (instance) => ({
    value: instance.name,
    detail: instance.kind,
    keywords: instance.aliases,
  }),
);
export function bossOptions(instance: string): EncounterOption[] {
  const query = normalize(instance);
  return encounterCatalog
    .filter(
      (entry) =>
        !query ||
        [entry.name, ...entry.aliases].some(
          (name) => normalize(name) === query,
        ),
    )
    .flatMap((entry) =>
      entry.bosses.map((boss) => ({
        value: boss.name,
        detail: entry.name,
        keywords: boss.aliases,
      })),
    );
}
