import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo, type ComponentProps, type CSSProperties } from "react";
import {
  armorSlots,
  accessorySlots,
  labels,
  twoHanded,
  type Build,
  type Catalog,
  type Entity,
} from "../domain";
import {
  attributeLabels,
  conditionLabels,
  boonLabels,
  calculateAttributes,
  primaryKeys,
  type AttributeData,
} from "../attributes";
import { accents, entityName, professions, weaponNames } from "../editor";
import { currentInfusions, infusionName } from "../infusions";
import {
  emptyMechanicPreview,
  landPets,
  legendFor,
  legendSkills,
  mechanicSlots,
} from "../profession-mechanics";
import {
  attunements,
  followingSkills,
  weaponSkillSlots,
} from "../weapon-skills";
import { referenceIndex, parseReference } from "../build-references";
import { encounterModeNames } from "../encounter-modes";
import { appVersion } from "../release";
import { MarkdownStyle } from "./MarkdownStyle";

function Portrait({ entity }: { entity?: Entity }) {
  return entity?.icon ? (
    <img
      src={entity.icon}
      alt=""
      data-export-image="icon"
      width="40"
      height="40"
      loading="eager"
    />
  ) : (
    <span className="png-icon-fallback" />
  );
}
function Skill({
  entity,
  label,
  build,
  catalog,
  related = [],
  command,
  expanded,
}: {
  entity?: Entity;
  label: string;
  build: Build;
  catalog: Catalog;
  related?: Entity[];
  command?: string;
  expanded: boolean;
}) {
  const stages = expanded
    ? [
        ...(entity ? followingSkills(entity, catalog, build) : []),
        ...related.map((skill) => ({ skill, label: "关联技能" })),
      ].filter(
        (stage, i, all) =>
          stage.skill.id !== entity?.id &&
          all.findIndex((other) => other.skill.id === stage.skill.id) === i,
      )
    : [];
  return (
    <div className="png-skill" data-skill-id={entity?.id}>
      <small>{label}</small>
      <span className="png-skill-icon">
        <Portrait entity={entity} />
      </span>
      <span className="png-skill-name">{entity?.name || "未选择"}</span>
      {!entity && command && <small>{command}</small>}
      {stages.map((stage) => (
        <div
          className="png-stage"
          key={stage.skill.id}
          data-skill-id={stage.skill.id}
        >
          <small>{stage.label}</small>
          <span className="png-skill-icon">
            <Portrait entity={stage.skill} />
          </span>
          <span>{stage.skill.name}</span>
        </div>
      ))}
    </div>
  );
}
function TraitLines({ build, catalog }: { build: Build; catalog: Catalog }) {
  return (
    <section className="png-section png-trait-section">
      <h2>特性选择</h2>
      <p className="png-muted">金色边框与勾选表示已选特性</p>
      {build.specs.map((selection, line) => {
        const spec = catalog.specs.find((s) => s.id === selection.id);
        return (
          <div className="png-trait-line" key={line}>
            <div className="png-trait-heading">
              <Portrait entity={spec} />
              <h3>{spec?.name || "未选择特性线"}</h3>
              <span>{spec?.elite ? "精英特长" : `特性线 0${line + 1}`}</span>
            </div>
            <div className="png-traits">
              {[1, 2, 3].map((tier) => {
                const minor = catalog.traits.find(
                    (t) =>
                      spec?.minor_traits?.includes(t.id) && t.tier === tier,
                  ),
                  majors = catalog.traits
                    .filter(
                      (t) =>
                        spec?.major_traits?.includes(t.id) && t.tier === tier,
                    )
                    .sort((a, b) => a.order - b.order),
                  selected = majors.find(
                    (t) => t.id === selection.traits[tier - 1],
                  );
                return (
                  <div className="png-trait-tier" data-tier={tier} key={tier}>
                    <small className="png-tier-label">
                      {["初阶", "大师", "宗师"][tier - 1]}
                    </small>
                    <div className="png-trait-stage">
                      <div className="png-minor" title={minor?.name}>
                        <span className="png-minor-icon">
                          <Portrait entity={minor} />
                        </span>
                        <span>{minor?.name || "未选择"}</span>
                      </div>
                      <div className="png-major-list">
                        {(majors.length
                          ? majors
                          : [undefined, undefined, undefined]
                        ).map((trait, i) => (
                          <div
                            key={trait?.id || i}
                            className={`png-trait-icon${trait && trait.id === selected?.id ? " is-selected" : ""}`}
                            data-trait-id={trait?.id}
                            title={trait?.name}
                          >
                            <Portrait entity={trait} />
                            {trait && trait.id === selected?.id && (
                              <span className="png-trait-check">✓</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <span
                      className={`png-trait-choice${selected ? " is-selected" : ""}`}
                    >
                      {selected ? `已选 · ${selected.name}` : "留空"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
function ImageSheet({
  build,
  catalog,
  data,
  description,
  followups,
}: {
  build: Build;
  catalog: Catalog;
  data: AttributeData;
  description: boolean;
  followups: boolean;
}) {
  const item = (id: number | null | undefined) =>
    entityName(id || null, catalog.items);
  const stat = (id: number | null) => entityName(id, catalog.stats);
  const find = (id: number | null | undefined) =>
    catalog.skills.find((s) => s.id === id);
  const sets: (1 | 2)[] = build.equipment.weapon2.weapon ? [1, 2] : [1];
  const spec = catalog.specs.find(
    (s) => s.elite && build.specs.some((b) => b.id === s.id),
  );
  const elements =
    build.profession === "Elementalist"
      ? ` · ${attunements[build.mechanics?.familiar || "Fire"]}协调`
      : "";
  const references = new Map(
    referenceIndex(catalog).map((r) => [`${r.kind}/${r.entity.id}`, r]),
  );
  function Link({ href = "", children }: ComponentProps<"a">) {
    const parsed = parseReference(href),
      reference = parsed && references.get(`${parsed.kind}/${parsed.id}`);
    return (
      <span className={reference ? "png-reference" : undefined}>
        {reference && <Portrait entity={reference.entity} />}
        {children}
      </span>
    );
  }
  return (
    <article
      className="png-sheet"
      style={{ "--class-accent": accents[build.profession] } as CSSProperties}
    >
      <header className="png-heading">
        <div>
          <small>P12 · 激战 2 配装工坊</small>
          <h1>{build.name || "未命名配装"}</h1>
          <p>
            {professions[build.profession]} / {spec?.name || "核心职业"} · 陆地
            PvE
          </p>
        </div>
        <span className="png-stamp">
          BD
          <br />
          配置快照
        </span>
      </header>
      {!!build.tags?.length && (
        <div className="png-tags">
          {build.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}
      {!!build.encounters?.length && (
        <div className="png-encounters">
          {build.encounters.map((e, i) => (
            <p key={i}>
              {e.instance} / {e.boss || "副本通用"}
              {e.mode && ` · ${encounterModeNames[e.mode]}`}
            </p>
          ))}
        </div>
      )}
      <div className="png-columns">
        <div>
          <section className="png-section">
            <h2>装备</h2>
            <table className="png-gear">
              <thead>
                <tr>
                  <th>护甲</th>
                  <th>属性</th>
                  <th>符文</th>
                </tr>
              </thead>
              <tbody>
                {armorSlots.map((key) => (
                  <tr key={key}>
                    <th>{labels[key]}</th>
                    <td>{stat(build.equipment[key].statId)}</td>
                    <td>{item(build.equipment[key].runeId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="png-gear">
              <thead>
                <tr>
                  <th>饰品</th>
                  <th>属性</th>
                </tr>
              </thead>
              <tbody>
                {accessorySlots.map((key) => (
                  <tr key={key}>
                    <th>{labels[key]}</th>
                    <td>{stat(build.equipment[key].statId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {([1, 2] as const).map((set) => {
              const main = build.equipment[set === 1 ? "weapon1" : "weapon2"],
                off = build.equipment[set === 1 ? "offhand1" : "offhand2"];
              return (
                <div className="png-weapon" key={set}>
                  <h3>武器组 {set === 1 ? "Ⅰ" : "Ⅱ"}</h3>
                  {[main, ...(!twoHanded.has(main.weapon) ? [off] : [])].map(
                    (slot, i) => (
                      <div key={i}>
                        <strong>
                          {i ? "副手" : "主手"} ·{" "}
                          {weaponNames[slot.weapon] || slot.weapon || "未装备"}
                        </strong>
                        {slot.weapon && (
                          <>
                            <p>{stat(slot.statId)}</p>
                            <p className="png-muted">
                              {slot.sigils
                                .slice(0, twoHanded.has(slot.weapon) ? 2 : 1)
                                .map(item)
                                .join(" / ")}
                            </p>
                          </>
                        )}
                      </div>
                    ),
                  )}
                </div>
              );
            })}
            <dl className="png-items">
              {[
                ["古物", build.relic],
                ["食物", build.food],
                ["扳手", build.utility],
                ["翠玉核心", build.jadeBotCore],
              ].map(([label, id]) => (
                <div key={String(label)}>
                  <dt>{label}</dt>
                  <dd>{item(id as number | null)}</dd>
                </div>
              ))}
            </dl>
            {sets.map((set) => (
              <div className="png-infusions" key={set}>
                <h3>灌注 · 武器组 {set === 1 ? "Ⅰ" : "Ⅱ"}</h3>
                {currentInfusions(build, set).length ? (
                  currentInfusions(build, set).map((g, i) => (
                    <p key={i}>
                      {infusionName(
                        catalog.items.find((item) => item.id === g.id),
                        g.attributeValue,
                      )}{" "}
                      × {g.count}
                    </p>
                  ))
                ) : (
                  <p className="png-muted">未配置</p>
                )}
              </div>
            ))}
          </section>
          <section className="png-section">
            <h2>基础属性</h2>
            <p className="png-muted">不含威能、激怒等临时预览条件</p>
            {sets.map((set) => {
              const result = calculateAttributes(build, catalog, data, set);
              return (
                <div key={set}>
                  <h3>武器组 {set === 1 ? "Ⅰ" : "Ⅱ"}</h3>
                  <dl className="png-stats">
                    {primaryKeys.map((key) => (
                      <div key={key}>
                        <dt>{attributeLabels[key]}</dt>
                        <dd>
                          {Math.round(result.primary[key]).toLocaleString(
                            "en-US",
                          )}
                        </dd>
                      </div>
                    ))}
                    {[
                      [
                        "暴击率",
                        Math.min(100, Math.max(0, result.criticalChance)),
                      ],
                      ["暴击伤害", result.criticalDamage],
                      ["症状持续时间", Math.min(100, result.conditionDuration)],
                      ["增益持续时间", Math.min(100, result.boonDuration)],
                      ["对盟友治疗加成", result.outgoingHealingBonus],
                      ...(result.controlDurationBonus
                        ? [["昏迷与晕眩时长加成", result.controlDurationBonus]]
                        : []),
                      ...Object.entries(result.conditions)
                        .filter(
                          ([, value]) =>
                            Math.abs(value - result.conditionDuration) > 0.001,
                        )
                        .map(([key, value]) => [
                          `${conditionLabels[key]}持续时间`,
                          Math.max(0, Math.min(100, value)),
                        ]),
                      ...Object.entries(result.boons)
                        .filter(
                          ([, value]) =>
                            Math.abs(value - result.boonDuration) > 0.001,
                        )
                        .map(([key, value]) => [
                          `${boonLabels[key]}持续时间`,
                          Math.max(0, Math.min(100, value)),
                        ]),
                    ].map(([name, value]) => (
                      <div key={name}>
                        <dt>{name}</dt>
                        <dd>{Number(value).toFixed(2)}%</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </section>
        </div>
        <div>
          <section className="png-section">
            <h2>特性与技能</h2>
            <h3>职业机制{elements}</h3>
            <div className="png-skill-row">
              {mechanicSlots(
                build,
                catalog,
                emptyMechanicPreview(),
                1,
                build.mechanics?.familiar || "Fire",
              ).map((slot) => (
                <Skill
                  key={slot.key}
                  entity={slot.skill}
                  label={slot.key}
                  build={build}
                  catalog={catalog}
                  related={slot.following}
                  command={slot.command}
                  expanded={followups}
                />
              ))}
            </div>
            {!!build.mechanics?.pets && (
              <div className="png-companions">
                <h3>陆地宠物</h3>
                {build.mechanics.pets.map((id, i) => (
                  <p key={i}>
                    {i ? "第二只" : "第一只"} · {entityName(id, landPets)}
                  </p>
                ))}
              </div>
            )}
            {build.mechanics?.familiar && (
              <p>魔宠元素 · {attunements[build.mechanics.familiar]}</p>
            )}
            {sets.map((set) => (
              <div
                className="png-weapon-skills"
                data-weapon-set={set}
                key={set}
              >
                <h3>
                  武器技能 · {set === 1 ? "Ⅰ" : "Ⅱ"}
                  {elements}
                </h3>
                <div className="png-skill-row">
                  {weaponSkillSlots(
                    build,
                    catalog,
                    set,
                    build.mechanics?.familiar || "Fire",
                  ).map((skill, i) => (
                    <Skill
                      key={i}
                      entity={skill}
                      label={String(i + 1)}
                      build={build}
                      catalog={catalog}
                      expanded={followups}
                    />
                  ))}
                </div>
              </div>
            ))}
            <h3>治疗、通用与精英技能</h3>
            <div className="png-skill-row">
              {build.skills.map((id, i) => (
                <Skill
                  key={i}
                  entity={find(id)}
                  label={["治疗", "通用Ⅰ", "通用Ⅱ", "通用Ⅲ", "精英"][i]}
                  build={build}
                  catalog={catalog}
                  expanded={followups}
                />
              ))}
            </div>
            {!!build.mechanics?.legends && (
              <div className="png-companions">
                <h3>传奇配置</h3>
                {build.mechanics.legends.map((id, i) => (
                  <div key={i}>
                    <p>
                      {i ? "第二传奇" : "第一传奇"} ·{" "}
                      {find(id)?.name || legendFor(id)?.id || "未选择"}
                    </p>
                    {i === 1 && id && (
                      <div className="png-skill-row">
                        {legendSkills(id).map((s, n) => (
                          <Skill
                            key={n}
                            entity={find(s)}
                            label={
                              ["治疗", "通用Ⅰ", "通用Ⅱ", "通用Ⅲ", "精英"][n]
                            }
                            build={build}
                            catalog={catalog}
                            expanded={followups}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
          <TraitLines build={build} catalog={catalog} />
        </div>
      </div>
      {description && build.description && (
        <section className="png-section png-description">
          <h2>BD 描述与讲解</h2>
          <MarkdownStyle
            style={build.descriptionStyle}
            className="png-markdown"
          >
            <Markdown
              remarkPlugins={[remarkGfm]}
              skipHtml
              urlTransform={(url) =>
                parseReference(url) ? url : defaultUrlTransform(url)
              }
              components={{
                a: Link,
                img: ({ node: _node, ...props }) => (
                  <img {...props} loading="eager" data-export-image="content" />
                ),
              }}
            >
              {build.description}
            </Markdown>
          </MarkdownStyle>
        </section>
      )}
      <footer className="png-footer">
        P12 · GW2 BUILD TOOLS · v{appVersion}
        <span>配装配置与基础属性 · PNG 静态快照</span>
      </footer>
    </article>
  );
}
export const BuildImageSheet = memo(ImageSheet);
