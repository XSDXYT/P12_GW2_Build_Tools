import { load } from "cheerio";

const professions = [
  "Guardian",
  "Warrior",
  "Engineer",
  "Ranger",
  "Thief",
  "Elementalist",
  "Mesmer",
  "Necromancer",
  "Revenant",
];
const tiers = { Adept: 1, Master: 2, Grandmaster: 3, Proficiency: 0 };
const weaponTypes = {
  Axe: "Axe",
  Dagger: "Dagger",
  Mace: "Mace",
  Pistol: "Pistol",
  Scepter: "Scepter",
  Sword: "Sword",
  Focus: "Focus",
  Shield: "Shield",
  Torch: "Torch",
  Warhorn: "Warhorn",
  Greatsword: "Greatsword",
  Hammer: "Hammer",
  Longbow: "Longbow",
  Shortbow: "Shortbow",
  Rifle: "Rifle",
  Staff: "Staff",
  Spear: "Spear",
  Trident: "Trident",
  Harpoon: "Harpoon",
  "Harpoon gun": "Speargun",
  Speargun: "Speargun",
};

// Read only explicit fields in the current, exact-ID infobox. Neither facts,
// page-wide link order nor a similarly named article can supply structure.
export function parseWikiStructure(
  html,
  { kind, id, title, revision, specNames },
) {
  if (!["traits", "skills"].includes(kind))
    throw Error("Unknown Wiki structure kind");
  const $ = load(html);
  const singular = kind === "traits" ? "trait" : "skill";
  const box = $(`.infobox.${singular}`).first();
  if (!box.length) throw Error(`Missing current infobox: ${kind}/${id}`);
  const actualRevision = Number(html.match(/"wgRevisionId"\s*:\s*(\d+)/)?.[1]);
  if (
    !Number.isSafeInteger(revision) ||
    revision <= 0 ||
    actualRevision !== revision
  )
    throw Error(`Wiki structure revision mismatch: ${kind}/${id}`);
  if (!title || /(?:^|\/)(?:history|Special:)|^Talk:/i.test(title))
    throw Error(`Invalid current Wiki title: ${title}`);
  const ids = new Set(
    box
      .find(`.gamelink[data-type="${singular}"]`)
      .toArray()
      .map((e) => Number($(e).attr("data-id"))),
  );
  for (const link of box.find('a[href*="api.guildwars2.com/v2/"]').toArray()) {
    const url = new URL($(link).attr("href"));
    if (url.hostname === "api.guildwars2.com" && url.pathname === `/v2/${kind}`)
      for (const value of (url.searchParams.get("ids") || "").split(","))
        if (/^[1-9]\d*$/.test(value)) ids.add(Number(value));
  }
  if (!ids.has(id))
    throw Error(`Wiki structure identity mismatch: ${kind}/${id}`);
  // A single page can combine different engine entities. Do not spread its
  // slot/profession across all of them merely because each ID is listed.
  if (ids.size !== 1) return { skipped: "multiple-game-ids" };
  box.find("script,style,small,sup").remove();
  const fields = new Map();
  for (const dt of box.find("dt").toArray()) {
    const label = $(dt).text().trim();
    const dd = $(dt).next("dd");
    if (!fields.has(label)) fields.set(label, []);
    fields.get(label).push(dd);
  }
  const values = {};
  const evidence = {};
  function field(label) {
    const entries = fields.get(label);
    return entries?.length === 1 ? entries[0] : undefined;
  }
  function text(label) {
    return field(label)?.text().replace(/\s+/g, " ").trim();
  }
  function set(name, value, label) {
    if (value !== undefined) {
      values[name] = value;
      evidence[name] = text(label);
    }
  }
  if (kind === "traits") {
    if (Object.hasOwn(tiers, text("Tier")))
      set("tier", tiers[text("Tier")], "Tier");
    const slot = text("Type");
    if (["Major", "Minor"].includes(slot)) set("slot", slot, "Type");
    const links = field("Specialization")?.find("a[title]").toArray() || [];
    const candidates = Object.entries(specNames).filter(([, name]) =>
      links.some(
        (e) => $(e).attr("title") === name && $(e).text().trim() === name,
      ),
    );
    if (candidates.length === 1)
      set("specialization", Number(candidates[0][0]), "Specialization");
    // The rendered infobox does not expose vertical order. Preserve the API
    // order rather than inferring it from unrelated page links or training order.
  } else {
    const names = (field("Profession")?.find("a[title]").toArray() || [])
      .filter((e) => $(e).text().trim() === $(e).attr("title"))
      .map((e) => $(e).attr("title"))
      .filter((name) => professions.includes(name));
    if (names.length)
      set("professions", [...new Set(names)].sort(), "Profession");
    const slot = text("Slot");
    if (["Healing", "Utility", "Elite"].includes(slot)) {
      set("slot", slot === "Healing" ? "Heal" : slot, "Slot");
      set("type", slot === "Healing" ? "Heal" : slot, "Slot");
    }
    if (Object.hasOwn(weaponTypes, text("Weapon")))
      set("weapon_type", weaponTypes[text("Weapon")], "Weapon");
    const attunement = text("Attunement");
    if (["Fire", "Water", "Air", "Earth"].includes(attunement))
      set("attunement", attunement, "Attunement");
  }
  return {
    id,
    title,
    revision,
    values,
    evidence,
    url: `https://wiki.guildwars2.com/wiki/${encodeURIComponent(title)}?oldid=${revision}`,
  };
}
