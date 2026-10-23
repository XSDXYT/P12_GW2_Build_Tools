import type { Catalog, Entity } from "./domain";
import { landPets } from "./profession-mechanics";
export type ReferenceKind = "skill" | "trait" | "item" | "pet";
export type BuildReference = {
  kind: ReferenceKind;
  entity: Entity;
  category: string;
};
export function referenceCategory(entity: Entity, kind: ReferenceKind): string {
  if (kind === "skill") return "技能";
  if (kind === "trait") return "特性";
  if (kind === "pet") return "宠物";
  if (entity.type === "Relic") return "古物";
  if (entity.details?.infusion_upgrade_flags?.includes("Infusion"))
    return "灌注";
  return (
    (
      { Food: "食物", Utility: "扳手", Sigil: "法印", Rune: "符文" } as Record<
        string,
        string
      >
    )[entity.details?.type] || "物品"
  );
}
export function referenceIndex(catalog: Catalog): BuildReference[] {
  return [
    ...(["skill", "trait", "item"] as const).flatMap((kind) =>
      catalog[
        kind === "skill" ? "skills" : kind === "trait" ? "traits" : "items"
      ].map((entity) => ({
        kind,
        entity,
        category: referenceCategory(entity, kind),
      })),
    ),
    ...landPets.map((entity) => ({
      kind: "pet" as const,
      entity,
      category: "宠物",
    })),
  ];
}
export function parseReference(
  url: string,
): { kind: ReferenceKind; id: number } | undefined {
  const match = /^gw2:(skill|trait|item|pet)\/([1-9]\d{0,9})$/.exec(url);
  if (!match) return;
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id)) return;
  return { kind: match[1] as ReferenceKind, id };
}
export function referenceMarkdown(reference: BuildReference): string {
  const label = reference.entity.name
    .replace(/[\\[\]]/g, (character) => `\\${character}`)
    .replace(/[\r\n]/g, " ");
  return `[${label}](gw2:${reference.kind}/${reference.entity.id})`;
}
export function slashQuery(
  text: string,
  cursor: number,
): { start: number; query: string } | undefined {
  const prefix = text.slice(0, cursor);
  if ((prefix.match(/^\s*```/gm)?.length || 0) % 2) return;
  const line = prefix.slice(prefix.lastIndexOf("\n") + 1);
  if ((line.match(/(?<!\\)`/g)?.length || 0) % 2) return;
  const start = prefix.lastIndexOf("/");
  if (start < 0 || (start > 0 && /[\w:/\\.]/.test(prefix[start - 1]))) return;
  const query = prefix.slice(start + 1);
  if (query.length > 60 || /[\n\r/`[\]()]/.test(query)) return;
  return { start, query };
}
export function searchReferences(
  index: BuildReference[],
  query: string,
  category = "",
): BuildReference[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return index.filter((reference) => {
    if (category && category !== reference.category) return false;
    const text =
      `${reference.entity.name} ${reference.entity.englishName || ""} ${reference.entity.apiName || ""} ${reference.entity.id}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
