import metadata from "./data/wiki-details.json";
import guardian from "./data/wiki/guardian.json";
import warrior from "./data/wiki/warrior.json";
import engineer from "./data/wiki/engineer.json";
import ranger from "./data/wiki/ranger.json";
import thief from "./data/wiki/thief.json";
import elementalist from "./data/wiki/elementalist.json";
import mesmer from "./data/wiki/mesmer.json";
import necromancer from "./data/wiki/necromancer.json";
import revenant from "./data/wiki/revenant.json";
import type { DetailKind, DetailFact } from "./game-details";
import { applyWikiModifiers, type WikiModifier } from "./wiki-modifiers";

export type WikiRow = Omit<DetailFact, "modified" | "scaling">;
export type WikiEntry = {
  profession: string;
  pageUnavailable?: boolean;
  title: string;
  revision: number;
  identityVerified: boolean;
  description?: string;
  rows: WikiRow[];
  notes?: string[];
  variants?: {
    specialization: number;
    replaceHealing?: boolean;
    rows: WikiRow[];
  }[];
  traitOverrides?: { trait: number; rows: WikiRow[] }[];
  modifiers?: WikiModifier[];
  selectedTraitNotes?: { id: number; name: string; description: string }[];
  branches?: {
    id: number;
    title: string;
    revision: number;
    label: string;
    rows: WikiRow[];
    requiresTrait?: number;
    modifiers?: WikiModifier[];
  }[];
};
const fragments = [
  guardian,
  warrior,
  engineer,
  ranger,
  thief,
  elementalist,
  mesmer,
  necromancer,
  revenant,
];
export const wikiSnapshot = {
  ...metadata,
  entries: {
    traits: Object.assign({}, ...fragments.map((f) => f.entries.traits)),
    skills: Object.assign({}, ...fragments.map((f) => f.entries.skills)),
  },
} as unknown as {
  schema: number;
  mode: "pve";
  professions: string[];
  generatedAt: string;
  branchCoverage: {
    parents: number;
    pages: number;
    branches: number;
    skippedRows: number;
    withheldRows: number;
  };
  mirror: string;
  specializationTraits: Record<number, number[]>;
  entries: Record<"traits" | "skills", Record<number, WikiEntry>>;
  coverage: Record<
    string,
    { pages: number; withFacts: number; skippedRows: number }
  >;
  professionCoverage: Record<
    string,
    Record<
      "traits" | "skills",
      {
        pages: number;
        verifiedPages: number;
        withFacts: number;
        skippedRows: number;
      }
    >
  >;
};

export function wikiDetails(
  id: number,
  kind: DetailKind,
  selectedTraits: ReadonlySet<number>,
  context: { healingPower?: number } = {},
) {
  if (kind === "item") return;
  const entry =
    wikiSnapshot.entries[kind === "trait" ? "traits" : "skills"][id];
  if (!entry) return;
  let rows = [...entry.rows];
  for (const variant of entry.variants || []) {
    if (
      !wikiSnapshot.specializationTraits[variant.specialization]?.some((t) =>
        selectedTraits.has(t),
      )
    )
      continue;
    if (variant.replaceHealing) rows = rows.filter((r) => !r.healing);
    rows.push(...variant.rows);
  }
  let facts: DetailFact[] = rows.map((row) => ({
    ...row,
    modified: false,
  }));
  for (const override of entry.traitOverrides || []) {
    if (!selectedTraits.has(override.trait)) continue;
    for (const row of override.rows) {
      const index = facts.findIndex((f) => f.label === row.label);
      const fact = { ...row, modified: true };
      if (index >= 0) facts[index] = { ...facts[index], ...fact };
      else facts.push(fact);
    }
  }
  facts = applyWikiModifiers(facts, entry.modifiers, selectedTraits);
  facts = scaleWikiHealing(facts, context.healingPower);
  return {
    facts,
    reviewed: entry.identityVerified,
    ...(entry.description ? { description: entry.description } : {}),
    selectedTraitNotes: entry.selectedTraitNotes?.filter((t) =>
      selectedTraits.has(t.id),
    ),
    notes: entry.notes,
    branches: entry.branches
      ?.filter(
        (branch) =>
          !branch.requiresTrait || selectedTraits.has(branch.requiresTrait),
      )
      .map((branch) => ({
        label: branch.label,
        facts: scaleWikiHealing(
          applyWikiModifiers(
            branch.rows.map((row) => ({
              ...row,
              modified: false,
            })),
            branch.modifiers,
            selectedTraits,
          ),
          context.healingPower,
        ),
        sourceUrl: `${wikiSnapshot.mirror}/wiki/${encodeURIComponent(branch.title)}`,
      })),
    sourceUrl: entry.pageUnavailable
      ? undefined
      : `${wikiSnapshot.mirror}/wiki/${encodeURIComponent(entry.title)}`,
    sources: entry.pageUnavailable
      ? []
      : [
          `${wikiSnapshot.mirror}/wiki/${encodeURIComponent(entry.title)}`,
          `https://wiki.guildwars2.com/index.php?title=${encodeURIComponent(entry.title)}&oldid=${entry.revision}`,
        ],
  };
}

/** Evaluate only the explicit Wiki formula, after selected-trait replacements. */
export function scaleWikiHealing(
  facts: DetailFact[],
  healingPower?: number,
): DetailFact[] {
  if (
    healingPower == null ||
    !Number.isFinite(healingPower) ||
    healingPower < 0
  )
    return facts;
  return facts.map((fact) => {
    const healing = fact.healing;
    if (
      !healing ||
      !Number.isFinite(healing.base) ||
      !Number.isFinite(healing.coefficient) ||
      healing.base < 0 ||
      healing.coefficient < 0
    )
      return fact;
    const formula = `${healing.base} + ${healing.coefficient} × 治疗效果`;
    // A changed row without an equivalent formula must not use stale metadata.
    if (!fact.detail.startsWith(formula)) return fact;
    const value = healing.base + healing.coefficient * healingPower;
    if (!Number.isFinite(value)) return fact;
    return {
      ...fact,
      detail:
        Math.round(value).toLocaleString("en-US") +
        fact.detail.slice(formula.length),
      scaling: { value, healingPower, formula },
    };
  });
}
