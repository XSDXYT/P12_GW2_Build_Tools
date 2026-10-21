import snapshot from "./data/pve-traits.json";

export type PveTrait = {
  rows: { label: string; amount: number; unit: "s" | "%" | "number" }[];
  effects: {
    status: string;
    duration: number;
    stacks?: number;
    applications?: number;
    recipient?: string;
    trigger?: string;
  }[];
  paths: string[];
};
export type PveSnapshot = {
  schema: number;
  mode: string;
  balance: string;
  sourceCommit: string;
  source: string;
  catalogRevision: string;
  traits: Record<string, PveTrait>;
};
export const pveSnapshot = snapshot as PveSnapshot;
export const pveTrait = (id: number): PveTrait | undefined =>
  pveSnapshot.traits[id];
export const pveSources = (id: number): string[] =>
  (pveTrait(id)?.paths || []).map(
    (path) => `${pveSnapshot.source}/blob/${pveSnapshot.sourceCommit}/${path}`,
  );
