import type { Build } from "./domain";
import { professions } from "./editor";
import { encounterModeNames } from "./encounter-modes";

export type BrowseBuild = Pick<Build, "id" | "name" | "tags" | "encounters"> & {
  profession: string;
};
export type BrowseFilter = {
  query: string;
  profession: string;
  tag: string;
  instance: string;
  boss: string;
  encounterMode?: string;
};
export function matchesBuild(
  build: BrowseBuild,
  filter: BrowseFilter,
  personalTags: string[] = [],
) {
  const tags = [...(build.tags || []), ...personalTags];
  const text = [
    build.name,
    professions[build.profession],
    ...tags,
    ...(build.encounters || []).flatMap(({ instance, boss, mode }) => [
      instance,
      boss || "",
      mode ? encounterModeNames[mode] : "",
    ]),
  ]
    .join(" ")
    .toLocaleLowerCase();
  return (
    (!filter.profession || build.profession === filter.profession) &&
    (!filter.tag || tags.includes(filter.tag)) &&
    ((!filter.instance && !filter.boss && !filter.encounterMode) ||
      (build.encounters || []).some(
        (e) =>
          (!filter.instance || e.instance === filter.instance) &&
          (!filter.boss || e.boss === filter.boss) &&
          (!filter.encounterMode || e.mode === filter.encounterMode),
      )) &&
    filter.query
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .every((word) => text.includes(word))
  );
}
export const sortedNames = (values: string[]) =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b, "zh-CN"));
export function encounterOptions(builds: BrowseBuild[], instance: string) {
  const encounters = builds.flatMap((b) => b.encounters || []);
  return {
    instances: sortedNames(encounters.map((e) => e.instance)),
    bosses: sortedNames(
      encounters
        .filter((e) => !instance || e.instance === instance)
        .flatMap((e) => (e.boss ? [e.boss] : [])),
    ),
  };
}
export type BuildGroup<T> = {
  key: string;
  title: string;
  children: { key: string; title: string; builds: T[] }[];
};
export function groupBuilds<T extends BrowseBuild>(
  builds: T[],
  mode: "encounter" | "profession",
  filter: Pick<BrowseFilter, "instance" | "boss" | "encounterMode">,
): BuildGroup<T>[] {
  const groups = new Map<string, BuildGroup<T>>();
  function add(
    key: string,
    title: string,
    childKey: string,
    childTitle: string,
    build: T,
  ) {
    if (!groups.has(key)) groups.set(key, { key, title, children: [] });
    const group = groups.get(key)!;
    let child = group.children.find((c) => c.key === childKey);
    if (!child) {
      child = { key: childKey, title: childTitle, builds: [] };
      group.children.push(child);
    }
    if (!child.builds.some((b) => b.id === build.id)) child.builds.push(build);
  }
  for (const build of builds) {
    if (mode === "profession") {
      add(
        build.profession,
        professions[build.profession] || build.profession,
        "all",
        "",
        build,
      );
      continue;
    }
    if (!build.encounters?.length) {
      add("unassigned", "未分类", "all", "", build);
      continue;
    }
    for (const encounter of build.encounters) {
      if (
        (filter.instance && encounter.instance !== filter.instance) ||
        (filter.boss && encounter.boss !== filter.boss) ||
        (filter.encounterMode && encounter.mode !== filter.encounterMode)
      )
        continue;
      add(
        "instance:" + encounter.instance,
        encounter.instance,
        JSON.stringify([encounter.boss || "", encounter.mode || ""]),
        (encounter.boss || "副本通用") +
          (encounter.mode ? " · " + encounterModeNames[encounter.mode] : ""),
        build,
      );
    }
  }
  return [...groups.values()].sort((a, b) =>
    a.key === "unassigned"
      ? 1
      : b.key === "unassigned"
        ? -1
        : a.title.localeCompare(b.title, "zh-CN"),
  );
}
