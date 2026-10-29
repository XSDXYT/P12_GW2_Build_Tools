import type { EditorProps } from "../editor";
import type { Entity } from "../domain";
import { useAttributePreview } from "../hooks/useAttributePreview";
import type { useGameTooltip } from "./GameTooltip";
import { followingSkills, type Attunement } from "../weapon-skills";
import {
  archetypeNames,
  eliteSpec,
  landPets,
  legendOptions,
  legendSkills,
  mechanicSlots,
  morphIds,
} from "../profession-mechanics";

export function ProfessionMechanics({
  build,
  catalog,
  readonly,
  edit,
  pick,
  tooltip,
  followupsExpanded,
  followupsId,
}: EditorProps & {
  tooltip: ReturnType<typeof useGameTooltip>;
  followupsExpanded: boolean;
  followupsId: string;
}) {
  const {
    weaponSet,
    attunement,
    onAttunement,
    onSecondaryAttunement,
    mechanicPreview,
    onMechanicPreview,
  } = useAttributePreview();
  const spec = eliteSpec(build, catalog);
  const slots = mechanicSlots(
    build,
    catalog,
    mechanicPreview,
    weaponSet,
    attunement,
  );
  const currentPet = landPets.find(
    (p) => p.id === build.mechanics?.pets?.[mechanicPreview.activePet],
  );
  function chooser(
    index: number,
    kind: "pets" | "legends",
    anchor: HTMLElement,
  ) {
    const selected = build.mechanics?.[kind] || [null, null];
    pick({
      title:
        kind === "pets" ? `陆地宠物 ${index + 1}` : `传奇姿态 ${index + 1}`,
      options: kind === "pets" ? landPets : legendOptions(build, catalog),
      selected: selected[index],
      icons: true,
      anchor,
      disabledIds: selected.filter(
        (id, i) => i !== index && id !== null,
      ) as number[],
      onSelect: (id) =>
        edit((b) => {
          const entries = [...(b.mechanics?.[kind] || [null, null])];
          entries[index] = id;
          b.mechanics = { ...b.mechanics, [kind]: entries };
          if (kind === "legends" && index === 0) b.skills = legendSkills(id);
        }),
    });
  }
  function showSkill(skill: Entity, label: string) {
    return (
      <button
        type="button"
        className="skill"
        aria-label={`${label}：${skill.name}`}
        {...tooltip.bind(skill, "skill")}
        onClick={(event) => tooltip.show(event.currentTarget, skill, "skill")}
      >
        <img src={skill.icon} alt="" loading="lazy" />
      </button>
    );
  }
  return (
    <div
      className="profession-mechanics"
      aria-label="职业机制"
      id={followupsId}
    >
      <div className="skills-heading">
        <h3>职业机制</h3>
        <small>随职业、特长与技能联动</small>
      </div>
      {build.profession === "Engineer" && (
        <p className="weapon-skills-note">
          腰带技能随下方技能组合派生；流金师 F2–F4
          可自行选择，玉偃师命令由已选特性决定。
        </p>
      )}
      {build.profession === "Ranger" && (
        <>
          <div className="mechanic-selections" aria-label="陆地宠物配置">
            {[0, 1].map((index) => {
              const pet = landPets.find(
                (p) => p.id === build.mechanics?.pets?.[index],
              );
              return (
                <div className="pet-choice" key={index}>
                  <span>陆地宠物 {index + 1}</span>
                  <button
                    type="button"
                    className="choice-field"
                    aria-label={`选择陆地宠物${index + 1}：${pet?.name || "未选择"}`}
                    {...tooltip.bind(pet, "pet")}
                    onClick={(event) => {
                      if (!readonly) {
                        tooltip.dismiss();
                        chooser(index, "pets", event.currentTarget);
                      } else if (pet)
                        tooltip.show(event.currentTarget, pet, "pet");
                    }}
                    title={
                      readonly ? pet?.description : "选择宠物，保存到当前 BD"
                    }
                  >
                    {pet?.icon && <img src={pet.icon} alt="" loading="lazy" />}
                    <span>{pet?.name || "未选择"}</span>
                    <span aria-hidden="true">⌄</span>
                  </button>
                  {pet && (
                    <small>
                      {archetypeNames[pet.archetype]} · {pet.description}
                    </small>
                  )}
                </div>
              );
            })}
          </div>
          <div className="segmented" aria-label="当前宠物预览">
            {([0, 1] as const).map((index) => (
              <button
                key={index}
                type="button"
                aria-pressed={mechanicPreview.activePet === index}
                onClick={() =>
                  onMechanicPreview((p) => ({ ...p, activePet: index }))
                }
              >
                宠物 {index + 1}
              </button>
            ))}
          </div>
          <p className="weapon-skills-note">
            当前预览：{currentPet?.name || "未选择宠物"}
            。切换宠物、合体或释放状态仅用于预览，不写入 BD。
          </p>
        </>
      )}
      {build.profession === "Revenant" && (
        <>
          <div className="mechanic-selections">
            {[0, 1].map((index) => {
              const id = build.mechanics?.legends?.[index];
              const skill = catalog.skills.find((s) => s.id === id);
              return (
                <div className="pet-choice" key={index}>
                  <span>传奇姿态 {index + 1}</span>
                  <button
                    type="button"
                    className="choice-field"
                    aria-label={`选择传奇姿态${index + 1}：${skill?.name || "未选择"}`}
                    {...tooltip.bind(skill, "skill")}
                    onClick={(event) => {
                      if (readonly) {
                        if (skill)
                          tooltip.show(event.currentTarget, skill, "skill");
                      } else chooser(index, "legends", event.currentTarget);
                    }}
                  >
                    <span>{skill?.name || "未选择"}</span>
                    <span aria-hidden="true">⌄</span>
                  </button>
                </div>
              );
            })}
          </div>
          <p className="weapon-skills-note">
            第一组传奇决定下方技能组合；第二组保存备用传奇，技能由所选传奇派生。
          </p>
          <div className="segmented" aria-label="当前传奇预览">
            {([0, 1] as const).map((index) => (
              <button
                key={index}
                type="button"
                aria-pressed={mechanicPreview.activeLegend === index}
                onClick={() =>
                  onMechanicPreview((p) => ({ ...p, activeLegend: index }))
                }
              >
                传奇 {index + 1}
              </button>
            ))}
          </div>
          {build.mechanics?.legends?.[1] && (
            <details className="mechanic-related">
              <summary>第二组传奇技能</summary>
              <div className="mechanic-grid">
                {legendSkills(build.mechanics.legends[1]).map((id, i) => {
                  const skill = catalog.skills.find((s) => s.id === id);
                  return (
                    skill && (
                      <div key={i}>
                        {showSkill(skill, "备用传奇技能")}
                        <span className="skill-name">{skill.name}</span>
                      </div>
                    )
                  );
                })}
              </div>
            </details>
          )}
        </>
      )}
      {build.profession === "Elementalist" && spec === 80 && (
        <label className="mechanic-familiar">
          魔宠元素{" "}
          <select
            aria-label="魔宠元素"
            value={build.mechanics?.familiar || "Fire"}
            disabled={readonly}
            onChange={(event) => {
              const familiar = event.target.value as Attunement;
              edit((b) => {
                b.mechanics = { ...b.mechanics, familiar };
              });
              if (build.specs.some((s) => s.traits.includes(2437)))
                onAttunement(familiar);
            }}
          >
            <option value="Fire">火焰 · 狐狸</option>
            <option value="Water">流水 · 水獭</option>
            <option value="Air">空气 · 野兔</option>
            <option value="Earth">大地 · 蟾蜍</option>
          </select>
        </label>
      )}
      {build.profession === "Warrior" && spec === 18 && (
        <label className="mechanic-preview-toggle">
          <input
            type="checkbox"
            checked={mechanicPreview.berserk}
            onChange={(e) =>
              onMechanicPreview((p) => ({ ...p, berserk: e.target.checked }))
            }
          />
          狂暴状态预览
        </label>
      )}
      <div className="mechanic-grid">
        {slots.map((slot) => {
          const skill =
            slot.skill && slot.actor
              ? { ...slot.skill, mechanicActor: slot.actor }
              : slot.skill;
          const following = [
            ...slot.following,
            ...(skill
              ? followingSkills(skill, catalog, build).map((s) => s.skill)
              : []),
          ].filter(
            (s, i, all) =>
              s.id !== skill?.id &&
              all.findIndex((other) => other.id === s.id) === i,
          );
          return (
            <div
              className="mechanic-slot"
              key={slot.key}
              data-mechanic-slot={slot.key}
            >
              <button
                type="button"
                className={`skill ${slot.attunement === attunement ? "selected" : ""}`}
                aria-label={`${slot.key}：${skill?.name || slot.command || (slot.selectMorph !== undefined ? "选择形态技能" : "未选择来源")}`}
                title={
                  slot.selectMorph !== undefined && !readonly
                    ? "点击选择形态技能；悬停或长按查看详情"
                    : slot.attunement
                      ? "切换协调预览"
                      : slot.toggle
                        ? "切换机制预览"
                        : skill
                          ? "查看技能详情"
                          : "机制说明"
                }
                aria-pressed={
                  slot.attunement
                    ? slot.attunement === attunement
                    : slot.toggle === "transform"
                      ? mechanicPreview.transformed
                      : undefined
                }
                disabled={
                  !skill &&
                  !slot.toggle &&
                  (slot.selectMorph === undefined || readonly)
                }
                {...tooltip.bind(skill, "skill")}
                onClick={(event) => {
                  if (slot.selectMorph !== undefined && !readonly) {
                    tooltip.dismiss();
                    const index = slot.selectMorph;
                    pick({
                      title: `${slot.key} 形态技能`,
                      options: catalog.skills.filter((s) =>
                        morphIds.includes(s.id),
                      ),
                      selected: skill?.id || null,
                      icons: true,
                      anchor: event.currentTarget,
                      disabledIds: (build.mechanics?.morphs || []).filter(
                        (id, i) => i !== index && id !== null,
                      ) as number[],
                      onSelect: (id) =>
                        edit((b) => {
                          const morphs = [
                            ...(b.mechanics?.morphs || [null, null, null]),
                          ];
                          morphs[index] = id;
                          b.mechanics = { ...b.mechanics, morphs };
                        }),
                    });
                    return;
                  }
                  if (slot.attunement) {
                    if (
                      spec === 80 &&
                      build.specs.some((s) => s.traits.includes(2437)) &&
                      slot.attunement !== (build.mechanics?.familiar || "Fire")
                    )
                      return;
                    if (spec === 56 && slot.attunement !== attunement)
                      onSecondaryAttunement(attunement);
                    onAttunement(slot.attunement as Attunement);
                  }
                  if (slot.toggle === "pet")
                    onMechanicPreview((p) => ({
                      ...p,
                      activePet: p.activePet === 0 ? 1 : 0,
                    }));
                  if (slot.toggle === "legend")
                    onMechanicPreview((p) => ({
                      ...p,
                      activeLegend: p.activeLegend === 0 ? 1 : 0,
                    }));
                  if (slot.toggle === "transform")
                    onMechanicPreview((p) => ({
                      ...p,
                      transformed: !p.transformed,
                    }));
                  if (skill) tooltip.show(event.currentTarget, skill, "skill");
                }}
              >
                {skill?.icon ? (
                  <img src={skill.icon} alt="" loading="lazy" />
                ) : (
                  <span aria-hidden="true">
                    {slot.selectMorph !== undefined ? "＋" : "—"}
                  </span>
                )}
              </button>
              <small>{slot.label}</small>
              <span className="skill-name">
                {skill?.name ||
                  slot.command ||
                  (slot.selectMorph !== undefined
                    ? "未选择形态"
                    : "未选择来源")}
              </span>
              {slot.actor && (
                <small className="mechanic-actor">
                  {slot.actor === "pet" ? "宠物施放" : "机甲施放"}
                </small>
              )}
              {following.length > 0 && (
                <details
                  className="mechanic-related"
                  open={followupsExpanded}
                  key={`${build.id}:${build.profession}`}
                >
                  <summary>后续 / 关联技能（{following.length}）</summary>
                  {following.map((child) => (
                    <div key={child.id} className="skill-followup">
                      {showSkill(
                        slot.actor
                          ? { ...child, mechanicActor: slot.actor }
                          : child,
                        "关联技能",
                      )}
                      <span className="skill-name">{child.name}</span>
                    </div>
                  ))}
                </details>
              )}
            </div>
          );
        })}
      </div>
      <p className="weapon-skills-note">
        悬停、聚焦或长按查看详情；协调和机制状态切换仅影响预览。
      </p>
    </div>
  );
}
