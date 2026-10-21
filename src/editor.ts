import type { Build, Catalog, Entity } from "./domain";
export type Edit = (change: (draft: Build) => void, undoLabel?: string) => void;
export type PickerRequest = {
  title: string;
  options: Entity[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  anchor: HTMLElement;
  namesOnly?: boolean;
  icons?: boolean;
  disabledIds?: number[];
};
export type Pick = (request: PickerRequest) => void;
export type EditorProps = {
  build: Build;
  catalog: Catalog;
  readonly: boolean;
  edit: Edit;
  pick: Pick;
  notify: (message: string) => void;
};
export const weaponNames: Record<string, string> = {
  Axe: "斧",
  Dagger: "匕首",
  Mace: "钉锤",
  Pistol: "手枪",
  Scepter: "节杖",
  Sword: "剑",
  Focus: "聚能器",
  Shield: "盾牌",
  Torch: "火炬",
  Warhorn: "战号",
  Greatsword: "巨剑",
  Hammer: "巨锤",
  Longbow: "长弓",
  Shortbow: "短弓",
  Rifle: "步枪",
  Staff: "法杖",
  Spear: "长矛",
};
export const professions: Record<string, string> = {
  Guardian: "守护者",
  Warrior: "战士",
  Engineer: "工程师",
  Ranger: "游侠",
  Thief: "潜行者",
  Elementalist: "元素使",
  Mesmer: "幻术师",
  Necromancer: "唤灵师",
  Revenant: "魂武者",
};
export const accents: Record<string, string> = {
  Mesmer: "#c89bdd",
  Guardian: "#81bfd4",
  Warrior: "#dab568",
  Engineer: "#c6a27d",
  Ranger: "#a7c47e",
  Thief: "#c9898e",
  Elementalist: "#e38c78",
  Necromancer: "#92bda5",
  Revenant: "#be8d9b",
};
export function plain(value: string = "") {
  return value.replace(/<[^>]*>/g, "").replaceAll("&nbsp;", " ");
}
export function entityName(
  id: number | null,
  entries: Entity[],
  fallback = "未选择",
) {
  return id
    ? entries.find((e) => e.id === id)?.name || `未知资料 #${id}`
    : fallback;
}
export function describe(item: Entity) {
  const labels: Record<string, string> = {
    Power: "威力",
    Precision: "精准",
    Toughness: "坚韧",
    Vitality: "体力",
    Ferocity: "暴击效果",
    ConditionDamage: "症状伤害",
    ConditionDuration: "症状效果",
    Healing: "治疗效果",
    BoonDuration: "增益效果",
    AgonyResistance: "痛苦抗性",
  };
  return plain(
    [
      item.details?.bonuses?.join("；"),
      item.details?.infix_upgrade?.buff?.description,
      item.details?.infix_upgrade?.attributes
        ?.map(
          (a: any) => `${labels[a.attribute] || a.attribute} +${a.modifier}`,
        )
        .join(" · "),
      item.description || item.details?.description,
    ]
      .filter(Boolean)
      .join("；") || "暂无效果说明",
  );
}
export function itemOptions(catalog: Catalog, type: string) {
  return catalog.items.filter((item) =>
    type === "Relic"
      ? item.type === "Relic"
      : type === "Infusion"
        ? item.details?.infusion_upgrade_flags?.includes("Infusion")
        : item.details?.type === type,
  );
}
export function matchOption(item: Entity, query: string) {
  const haystack = [item.name, item.apiName, item.englishName, String(item.id)]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/u)
    .every((word) => haystack.includes(word));
}
