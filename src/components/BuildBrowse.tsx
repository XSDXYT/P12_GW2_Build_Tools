import type { ReactNode } from "react";
import {
  encounterOptions,
  groupBuilds,
  type BrowseBuild,
  type BrowseFilter,
} from "../build-classification";
import { professions } from "../editor";
import { encounterModes, encounterModeNames } from "../encounter-modes";

export function EncounterFilters({
  entries,
  instance,
  boss,
  change,
  prefix = "",
  mode = "",
  changeMode,
}: {
  entries: BrowseBuild[];
  instance: string;
  boss: string;
  change: (instance: string, boss: string) => void;
  prefix?: string;
  mode?: string;
  changeMode?: (mode: string) => void;
}) {
  const options = encounterOptions(entries, instance);
  return (
    <>
      <label>
        副本
        <select
          aria-label={`${prefix}筛选副本`}
          value={instance}
          onChange={(e) => change(e.target.value, "")}
        >
          <option value="">全部副本</option>
          {options.instances.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      {changeMode && (
        <label>
          模式
          <select
            aria-label={`${prefix}筛选模式`}
            value={mode}
            onChange={(e) => changeMode(e.target.value)}
          >
            <option value="">全部模式</option>
            {encounterModes.map((value) => (
              <option key={value} value={value}>
                {encounterModeNames[value]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        BOSS
        <select
          aria-label={`${prefix}筛选BOSS`}
          value={boss}
          onChange={(e) => change(instance, e.target.value)}
        >
          <option value="">全部 BOSS</option>
          {options.bosses.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
    </>
  );
}
export function GroupMode({
  value,
  change,
}: {
  value: "encounter" | "profession";
  change: (value: "encounter" | "profession") => void;
}) {
  return (
    <label className="build-group-mode">
      列表分组
      <select
        aria-label="BD列表分组"
        value={value}
        onChange={(e) => change(e.target.value as typeof value)}
      >
        <option value="encounter">按副本 / BOSS</option>
        <option value="profession">按职业</option>
      </select>
    </label>
  );
}
export function BuildGroups<T extends BrowseBuild>({
  entries,
  mode,
  filter,
  children,
}: {
  entries: T[];
  mode: "encounter" | "profession";
  filter: Pick<BrowseFilter, "instance" | "boss" | "encounterMode">;
  children: (entry: T, cardKey: string) => ReactNode;
}) {
  return (
    <>
      {groupBuilds(entries, mode, filter).map((group) => (
        <section
          className="build-list-group"
          key={group.key}
          aria-label={group.title}
        >
          <h3>{group.title}</h3>
          {group.children.map((child) => (
            <div key={child.key} className="build-list-subgroup">
              {child.title && (
                <h4>
                  {child.title} <small>{child.builds.length} 个 BD</small>
                </h4>
              )}
              {child.builds.map((build) => (
                <div key={build.id}>
                  {children(
                    build,
                    JSON.stringify([group.key, child.key, build.id]),
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
export function BuildBadges({ build }: { build: BrowseBuild }) {
  return (
    <span className="build-summary">
      <span>{professions[build.profession] || build.profession}</span>
      {(build.tags || []).map((tag) => (
        <span className="build-badge" key={tag}>
          {tag}
        </span>
      ))}
      {!!build.encounters?.length && (
        <small>
          {build.encounters
            .map(
              (e) =>
                `${e.instance} / ${e.boss || "副本通用"}${e.mode ? " · " + encounterModeNames[e.mode] : ""}`,
            )
            .join("；")}
        </small>
      )}
    </span>
  );
}
