import { type EditorProps } from "../editor";
import { useId } from "react";
import { activeTraits } from "../attributes";
import { useGameTooltip } from "./GameTooltip";
import { useAttributePreview } from "../hooks/useAttributePreview";
import { ProfessionMechanics } from "./ProfessionMechanics";
import { legendSkills, normalizeMechanics } from "../profession-mechanics";
import {
  attunements,
  followingSkills,
  weaponSkillSlots,
  type Attunement,
} from "../weapon-skills";
export function TraitsPanel({
  build,
  catalog,
  readonly,
  edit,
  pick,
  notify,
  followupsExpanded: showFollowups,
  onToggleFollowups,
}: EditorProps & {
  followupsExpanded: boolean;
  onToggleFollowups: () => void;
}) {
  const followupsId = useId();
  const selectedSpecs = build.specs.flatMap((s) => (s.id ? [s.id] : []));
  const {
    result,
    weaponSet,
    onWeaponSet,
    attunement,
    onAttunement,
    secondaryAttunement,
    onSecondaryAttunement,
    mechanicPreview,
  } = useAttributePreview();
  const tooltip = useGameTooltip(
    new Set(activeTraits(build, catalog).map((trait) => trait.id)),
    `${build.id}:${build.profession}:${selectedSpecs.join(",")}:${JSON.stringify(mechanicPreview)}:${JSON.stringify(build.mechanics)}:${build.skills.join(",")}`,
    result?.primary.Healing,
    result?.controlDurationBonus,
    result || {},
  );
  const weaponSkills = weaponSkillSlots(
    build,
    catalog,
    weaponSet,
    attunement,
    secondaryAttunement,
  );
  const secondaryLegend =
    build.profession === "Revenant" && mechanicPreview.activeLegend === 1;
  const displayedSkills = secondaryLegend
    ? legendSkills(build.mechanics?.legends?.[1])
    : build.skills;
  const stages = (skill: (typeof catalog.skills)[number] | undefined) =>
    showFollowups &&
    skill &&
    followingSkills(skill, catalog, build).map(({ skill: child, label }) => (
      <div className="skill-followup" key={child.id}>
        <span className="skill-stage-label">{label}</span>
        <button
          type="button"
          className="skill"
          aria-label={`查看${child.name}详情`}
          {...tooltip.bind(child, "skill")}
          onClick={(event) => tooltip.show(event.currentTarget, child, "skill")}
        >
          <img src={child.icon} alt="" loading="lazy" />
        </button>
        <span className="skill-name" title={child.name}>
          {child.name}
        </span>
      </div>
    ));
  return (
    <section className="panel traits-panel" aria-labelledby="traits-heading">
      <header className="panel-heading">
        <div>
          <h2 id="traits-heading">
            特性与技能 <small>TRAITS & SKILLS</small>
          </h2>
        </div>
        <span className="panel-caption">
          {catalog.professions.find((p) => p.id === build.profession)?.name}
        </span>
      </header>
      <ProfessionMechanics
        tooltip={tooltip}
        build={build}
        catalog={catalog}
        readonly={readonly}
        edit={edit}
        pick={pick}
        notify={notify}
        followupsExpanded={showFollowups}
        followupsId={`${followupsId}-mechanics`}
      />
      <div className="weapon-skills-bar" id={`${followupsId}-weapons`}>
        <div className="weapon-skills-heading">
          <h3>武器技能</h3>
          <label>
            武器组{" "}
            <select
              aria-label="技能预览武器组"
              value={weaponSet}
              onChange={(e) => onWeaponSet(+e.target.value as 1 | 2)}
            >
              <option value={1}>Ⅰ</option>
              <option value={2} disabled={!build.equipment.weapon2.weapon}>
                Ⅱ
              </option>
            </select>
          </label>
          <button
            type="button"
            className="skill-followups-toggle"
            aria-expanded={showFollowups}
            aria-controls={`${followupsId}-weapons ${followupsId}-skills ${followupsId}-mechanics`}
            title="一键展开或收起武器、技能组合及职业机制的连段和条件变种，仅影响本次查看。"
            onClick={(event) => {
              tooltip.dismiss();
              event.currentTarget.focus({ preventScroll: true });
              onToggleFollowups();
            }}
          >
            {showFollowups ? "收起后续技能" : "展开后续技能"}
          </button>
        </div>
        {build.profession === "Elementalist" && (
          <div className="attunement-controls">
            <label>
              主协调{" "}
              <select
                aria-label="技能主协调"
                value={attunement}
                onChange={(e) => onAttunement(e.target.value as Attunement)}
              >
                {Object.entries(attunements).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {selectedSpecs.includes(56) && (
              <label>
                副协调{" "}
                <select
                  aria-label="技能副协调"
                  value={secondaryAttunement}
                  onChange={(e) =>
                    onSecondaryAttunement(e.target.value as Attunement)
                  }
                >
                  {Object.entries(attunements).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <small>仅供预览，不写入 BD</small>
          </div>
        )}
        <div className="skill-list weapon-skill-list">
          {weaponSkills.map((skill, i) => (
            <div key={skill?.id || i} data-weapon-slot={i + 1}>
              <button
                type="button"
                className="skill"
                aria-label={`武器技能${i + 1}：${skill?.name || "未装备"}`}
                disabled={!skill}
                {...tooltip.bind(skill, "skill")}
                onClick={(e) =>
                  skill && tooltip.show(e.currentTarget, skill, "skill")
                }
              >
                {skill?.icon ? (
                  <img src={skill.icon} alt="" loading="lazy" />
                ) : (
                  <span>—</span>
                )}
              </button>
              <small>技能 {i + 1}</small>
              <span className="skill-name" title={skill?.name}>
                {skill?.name || "未装备"}
              </span>
              {stages(skill)}
            </div>
          ))}
        </div>
        <p className="weapon-skills-note">
          陆地技能 ·
          后续连段和条件变种默认收起，可一键展开；悬停或点击查看详情。
        </p>
        {build.profession === "Thief" &&
          weaponSkills[1]?.weapon_type === "Spear" && (
            <p className="weapon-skills-note">
              长矛两条攻击链可交叉推进；潜袭需要潜行，终结技需要先完成后续攻击。
            </p>
          )}
      </div>
      <div className="skills-bar" id={`${followupsId}-skills`}>
        <div className="skills-heading">
          <h3>技能组合</h3>
          <small>{readonly ? "点击查看详情" : "点击技能图标更换"}</small>
        </div>
        <div className="skill-list">
          {displayedSkills.map((id, index) => {
            const skill = catalog.skills.find((s) => s.id === id),
              type = ["Heal", "Utility", "Utility", "Utility", "Elite"][index],
              label = ["治疗", "通用一", "通用二", "通用三", "精英"][index];
            const options = catalog.skills.filter(
              (s) =>
                s.type === type &&
                !s.detailOnly &&
                s.professions?.includes(build.profession) &&
                (!s.specialization || selectedSpecs.includes(s.specialization)),
            );
            const legendAllowed =
              build.profession === "Revenant" && build.mechanics?.legends?.[0]
                ? legendSkills(build.mechanics.legends[0])
                : null;
            const legalOptions = legendAllowed
              ? options.filter((s) =>
                  index === 0 || index === 4
                    ? s.id === legendAllowed[index]
                    : legendAllowed.slice(1, 4).includes(s.id),
                )
              : options;
            return (
              <div key={index}>
                <button
                  type="button"
                  className={`skill ${id ? "selected" : ""}`}
                  aria-label={`选择${label}技能`}
                  {...tooltip.bind(skill, "skill")}
                  onClick={(event) => {
                    if (readonly || secondaryLegend) {
                      if (skill)
                        tooltip.show(event.currentTarget, skill, "skill");
                      return;
                    }
                    tooltip.dismiss();
                    pick({
                      title: `${label}技能`,
                      options: legalOptions,
                      selected: id,
                      icons: true,
                      anchor: event.currentTarget,
                      disabledIds: build.skills.filter(
                        (s, i) => i !== index && s !== null,
                      ) as number[],
                      onSelect: (value) =>
                        edit((b) => {
                          b.skills[index] = value;
                        }),
                    });
                  }}
                >
                  {skill?.icon ? (
                    <img src={skill.icon} alt="" />
                  ) : (
                    <span>＋</span>
                  )}
                </button>
                <small>
                  {["治疗", "通用 Ⅰ", "通用 Ⅱ", "通用 Ⅲ", "精英"][index]}
                </small>
                <span className="skill-name">
                  {skill?.name || (id ? `未知 #${id}` : "未选择")}
                </span>
                {stages(skill)}
              </div>
            );
          })}
        </div>
      </div>
      <div className="trait-lines">
        {build.specs.map((selection, line) => {
          const spec = catalog.specs.find((s) => s.id === selection.id);
          const options = catalog.specs.filter(
            (s) =>
              s.profession === build.profession && (line === 2 || !s.elite),
          );
          return (
            <div
              key={line}
              className="trait-line"
              style={
                spec?.background
                  ? {
                      backgroundImage: `linear-gradient(90deg,#191c23e8,#191c23dc),url(${spec.background})`,
                    }
                  : undefined
              }
            >
              <div className="spec-heading">
                <button
                  type="button"
                  className="spec-pick"
                  aria-label={`选择第${line + 1}条特性线：${spec?.name || "未选择"}`}
                  onClick={(event) => {
                    tooltip.dismiss();
                    pick({
                      title: `第 ${line + 1} 条特性线`,
                      options,
                      selected: selection.id,
                      icons: true,
                      disabledIds: build.specs.flatMap((s, i) =>
                        i !== line && s.id ? [s.id] : [],
                      ),
                      anchor: event.currentTarget,
                      onSelect: (id) => {
                        const next = build.specs.map((s, i) =>
                          i === line ? id : s.id,
                        );
                        if (
                          next.filter(
                            (id) =>
                              catalog.specs.find((s) => s.id === id)?.elite,
                          ).length > 1
                        ) {
                          notify("只能选择一个精英特长。");
                          return;
                        }
                        if (
                          selection.id &&
                          id !== selection.id &&
                          !confirm(
                            "更换特性线将清空本行特性和不兼容的技能。继续吗？",
                          )
                        )
                          return;
                        if (id === selection.id) return;
                        edit((b) => {
                          b.specs[line] = { id, traits: [null, null, null] };
                          b.skills = b.skills.map((id) => {
                            const s = catalog.skills.find((s) => s.id === id);
                            return s?.specialization &&
                              !next.includes(s.specialization)
                              ? null
                              : id;
                          });
                          normalizeMechanics(b, catalog);
                        });
                      },
                    });
                  }}
                >
                  {spec?.icon ? (
                    <img src={spec.icon} alt="" />
                  ) : (
                    <span className="spec-placeholder">＋</span>
                  )}
                  <strong>
                    {spec?.name ||
                      (selection.id
                        ? `未知特性线 #${selection.id}`
                        : `选择特性线 ${line + 1}`)}
                  </strong>
                  <span className="spec-tag">
                    {spec?.elite ? "精英特长" : `特性线 0${line + 1}`}
                  </span>
                  <span className="choice-arrow" aria-hidden="true">
                    ⌄
                  </span>
                </button>
              </div>
              <div className="trait-tiers">
                {[1, 2, 3].map((tier) => {
                  const minor = catalog.traits.find(
                    (t) =>
                      spec?.minor_traits?.includes(t.id) && t.tier === tier,
                  );
                  return (
                    <div key={tier} className="trait-tier">
                      <span className="tier-label">
                        {["初阶", "大师", "宗师"][tier - 1]}
                      </span>
                      <div className="trait-stage">
                        {minor ? (
                          <button
                            className="minor"
                            aria-label={minor.name}
                            {...tooltip.bind(minor, "trait")}
                            onClick={(event) =>
                              tooltip.show(event.currentTarget, minor, "trait")
                            }
                          >
                            <img src={minor.icon} alt="" />
                          </button>
                        ) : (
                          <span className="minor-placeholder" />
                        )}
                        <div className="major-list">
                          {spec
                            ? catalog.traits
                                .filter(
                                  (t) =>
                                    spec.major_traits?.includes(t.id) &&
                                    t.tier === tier,
                                )
                                .sort((a, b) => a.order - b.order)
                                .map((trait) => (
                                  <button
                                    key={trait.id}
                                    className={`trait ${selection.traits[tier - 1] === trait.id ? "active" : ""}`}
                                    aria-label={trait.name}
                                    aria-pressed={
                                      selection.traits[tier - 1] === trait.id
                                    }
                                    {...tooltip.bind(trait, "trait")}
                                    onClick={(event) => {
                                      if (readonly) {
                                        tooltip.show(
                                          event.currentTarget,
                                          trait,
                                          "trait",
                                        );
                                        return;
                                      }
                                      edit((b) => {
                                        b.specs[line].traits[tier - 1] =
                                          b.specs[line].traits[tier - 1] ===
                                          trait.id
                                            ? null
                                            : trait.id;
                                      });
                                    }}
                                  >
                                    <img src={trait.icon} alt="" />
                                  </button>
                                ))
                            : [0, 1, 2].map((i) => (
                                <span className="trait-placeholder" key={i} />
                              ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="game-tooltip-hint">
        悬停或聚焦图标查看详情 · F1 进入详情 · 触屏长按
      </p>
      {tooltip.content}
    </section>
  );
}
