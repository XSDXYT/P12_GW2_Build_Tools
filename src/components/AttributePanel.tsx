import { useEffect, useState } from "react";
import { useAttributePreview } from "../hooks/useAttributePreview";
import {
  attributeLabels,
  primaryKeys,
  conditionLabels,
  emptyPreview,
  type Attribute,
  type Contribution,
} from "../attributes";
const number = (value: number) => Math.round(value).toLocaleString("en-US");
const percent = (value: number) => value.toFixed(2) + "%";
const cap = (value: number) => Math.max(0, Math.min(100, value));
export function AttributePanel() {
  const {
    build,
    weaponSet,
    onWeaponSet,
    error,
    load,
    preview,
    setPreview,
    baseline,
    result,
  } = useAttributePreview();
  const [details, setDetails] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    setSelected(null);
  }, [build.id, build.profession]);
  if (!baseline || !result)
    return (
      <div className="attribute-panel">
        <h3>属性预览</h3>
        <p className="attribute-loading">
          {error
            ? "属性资料加载失败，未显示计算结果。"
            : "正在加载属性计算资料…"}
        </p>
        {error && <button onClick={() => void load()}>重新加载属性资料</button>}
      </div>
    );
  const row = (
    key: string,
    label: string,
    value: number,
    original: number,
    isPercent = false,
    limited = false,
    exception = false,
  ) => {
    const display = limited ? cap(value) : value,
      old = limited ? cap(original) : original;
    const format = isPercent ? percent : number;
    const changed = format(display) !== format(old);
    return (
      <button
        type="button"
        className={`attribute-row ${exception ? "attribute-exception" : ""} ${selected === key ? "attribute-selected" : ""}`}
        data-attribute={key}
        key={key}
        aria-label={`查看${label}来源`}
        aria-expanded={selected === key}
        title={
          limited && value > 100
            ? `实际上限 100%；未封顶数值 ${percent(value)}`
            : label + " · 点击查看来源"
        }
        onClick={() => setSelected(selected === key ? null : key)}
      >
        <span>{label}</span>
        <span className={changed ? "attribute-changed" : ""}>
          {changed && <del>{format(old)}</del>}
          <strong data-value={key}>{format(display)}</strong>
          {limited && value > 100 && <sup>上限</sup>}
        </span>
      </button>
    );
  };
  let breakdown: Contribution[] = [];
  let breakdownTitle = "";
  let formula = "";
  if (selected && primaryKeys.includes(selected as Attribute)) {
    breakdown = result.primarySources[selected as Attribute];
    breakdownTitle = attributeLabels[selected as Attribute];
    formula = "按当前武器组汇总；装备属性在每件装备内取整。";
  }
  if (selected === "CriticalChance") {
    breakdownTitle = "暴击率";
    breakdown = [
      { label: "80 级基础暴击率", amount: 5 },
      { label: "精准换算", amount: (result.primary.Precision - 1000) / 21 },
      ...result.criticalSources,
    ];
    formula = "5% + (精准 − 1000) ÷ 21；生效值上限 100%。";
  }
  if (selected === "CriticalDamage") {
    breakdownTitle = "暴击伤害";
    breakdown = [
      { label: "基础暴击伤害", amount: 150 },
      { label: "暴击效果换算", amount: result.primary.CritDamage / 15 },
    ];
    formula = "150% + 暴击效果 ÷ 15。未支持的额外倍率会列在未计入清单。";
  }
  if (
    selected === "ConditionBonus" ||
    selected === "BoonBonus" ||
    (selected && conditionLabels[selected])
  ) {
    const boon = selected === "BoonBonus";
    const specific = selected && conditionLabels[selected];
    breakdownTitle = boon
      ? "增益持续时间"
      : specific
        ? specific + "持续时间"
        : "症状持续时间";
    breakdown = [
      ...result.primarySources[boon ? "BoonDuration" : "ConditionDuration"].map(
        (source) => ({
          label: source.label + " · 属性换算",
          amount: source.amount / 15,
        }),
      ),
      ...(result.durationSources[boon ? "Boon" : "Condition"] || []),
      ...(specific ? result.durationSources[selected!] || [] : []),
    ];
    formula =
      "对应属性 ÷ 15，再叠加直接持续时间奖励。单类症状在通用奖励上继续叠加，生效值上限 100%。";
  }
  const hasAttunement = result.controls.some((c) =>
    ["air", "fire"].includes(c.key),
  );
  return (
    <div className="attribute-panel" aria-label="属性预览">
      <div className="attribute-heading">
        <h3>
          属性预览 <small>ATTRIBUTES</small>
        </h3>
        <div className="attribute-weapon">
          <label>
            武器组
            <select
              aria-label="属性预览武器组"
              value={weaponSet}
              onChange={(event) => onWeaponSet(+event.target.value as 1 | 2)}
            >
              <option value={1}>Ⅰ</option>
              <option value={2} disabled={!build.equipment.weapon2.weapon}>
                Ⅱ
              </option>
            </select>
          </label>
          <span>80 级 · 升华</span>
        </div>
      </div>
      <div className="attribute-columns">
        <div className="attribute-section">
          <h4>
            基本属性 <small>PRIMARY</small>
          </h4>
          {primaryKeys.map((key) =>
            row(
              key,
              attributeLabels[key],
              result.primary[key],
              baseline.primary[key],
            ),
          )}
        </div>
        <div className="attribute-section">
          <h4>
            衍生属性 <small>DERIVED</small>
          </h4>
          {row(
            "CriticalChance",
            "暴击率",
            result.criticalChance,
            baseline.criticalChance,
            true,
            true,
          )}
          {row(
            "CriticalDamage",
            "暴击伤害",
            result.criticalDamage,
            baseline.criticalDamage,
            true,
          )}
          <div className="duration-control">
            {row(
              "ConditionBonus",
              "症状持续时间",
              result.conditionDuration,
              baseline.conditionDuration,
              true,
              true,
            )}
            <button
              className="duration-details"
              aria-expanded={details}
              onClick={() => setDetails((value) => !value)}
            >
              详情
            </button>
          </div>
          {Object.entries(conditionLabels)
            .filter(
              ([key]) =>
                details ||
                Math.abs(
                  cap(result.conditions[key]) - cap(result.conditionDuration),
                ) > 0.005,
            )
            .map(([key, label]) =>
              row(
                key,
                label + "持续时间",
                result.conditions[key],
                baseline.conditions[key],
                true,
                true,
                true,
              ),
            )}
          {row(
            "BoonBonus",
            "增益持续时间",
            result.boonDuration,
            baseline.boonDuration,
            true,
            true,
          )}
          <p className="attribute-tip">点击数值行查看来源与公式。</p>
        </div>
      </div>
      {selected && (
        <div className="attribute-breakdown">
          <div>
            <h5>{breakdownTitle}来源</h5>
            <button aria-label="关闭属性来源" onClick={() => setSelected(null)}>
              ×
            </button>
          </div>
          <p>{formula}</p>
          <ul>
            {breakdown
              .filter((source) => Math.abs(source.amount) > 0.0001)
              .map((source, index) => (
                <li key={index}>
                  <span>{source.label}</span>
                  <b>
                    {source.amount >= 0 ? "+" : ""}
                    {primaryKeys.includes(selected as Attribute)
                      ? number(source.amount)
                      : percent(source.amount)}
                  </b>
                </li>
              ))}
          </ul>
          {breakdown.every((source) => Math.abs(source.amount) < 0.0001) && (
            <small>当前没有额外加成。</small>
          )}
        </div>
      )}
      <details className="attribute-effects">
        <summary>
          条件预览 <small>仅用于查看，不写入 BD</small>
        </summary>
        <div className="attribute-preview-controls">
          <label className="preview-number">
            <span>威能层数</span>
            <input
              aria-label="预览威能层数"
              type="number"
              min={0}
              max={25}
              value={preview.might}
              onChange={(event) =>
                setPreview((p) => ({
                  ...p,
                  might: Math.max(
                    0,
                    Math.min(25, Math.trunc(Number(event.target.value) || 0)),
                  ),
                }))
              }
            />
            <small>每层 +30 威力、+30 症状伤害</small>
          </label>
          <label className="preview-check">
            <input
              type="checkbox"
              aria-label="预览激怒"
              checked={preview.fury}
              onChange={(event) =>
                setPreview((p) => ({ ...p, fury: event.target.checked }))
              }
            />
            <span>拥有激怒</span>
            <small>基础 +25% 暴击率，另计已支持特性</small>
          </label>
          <label className="preview-check">
            <input
              type="checkbox"
              aria-label="预览拥有再生"
              checked={!!preview.flags.regeneration}
              onChange={(event) =>
                setPreview((p) => ({
                  ...p,
                  flags: { ...p.flags, regeneration: event.target.checked },
                }))
              }
            />
            <span>拥有再生</span>
            <small>
              {result.controls.find((control) => control.key === "regeneration")
                ?.description
                ? `${result.controls.find((control) => control.key === "regeneration")!.description}：按再生条件联动属性`
                : "联动已支持的再生条件特性；不预览再生治疗量"}
            </small>
          </label>
          {hasAttunement && (
            <label className="preview-number">
              <span>当前协调</span>
              <select
                aria-label="预览当前协调"
                value={
                  preview.flags.fire
                    ? "fire"
                    : preview.flags.air
                      ? "air"
                      : "none"
                }
                onChange={(event) =>
                  setPreview((p) => ({
                    ...p,
                    flags: {
                      ...p.flags,
                      fire: event.target.value === "fire",
                      air: event.target.value === "air",
                    },
                  }))
                }
              >
                <option value="none">其他 / 不模拟</option>
                {result.controls
                  .filter((c) => ["fire", "air"].includes(c.key))
                  .map((control) => (
                    <option key={control.key} value={control.key}>
                      {control.label}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {result.controls
            .filter((c) => !["fire", "air", "regeneration"].includes(c.key))
            .map((control) =>
              control.max ? (
                <label className="preview-number" key={control.key}>
                  <span>{control.label}</span>
                  <input
                    type="number"
                    aria-label={`预览${control.label}`}
                    min={0}
                    max={control.max}
                    value={preview.stacks[control.key] || 0}
                    onChange={(event) =>
                      setPreview((p) => ({
                        ...p,
                        stacks: {
                          ...Object.fromEntries(
                            Object.entries(p.stacks).map(([key, value]) => [
                              key,
                              control.key.startsWith("sigil-") &&
                              key.startsWith("sigil-")
                                ? 0
                                : value,
                            ]),
                          ),
                          [control.key]: Math.max(
                            0,
                            Math.min(
                              control.max!,
                              Math.trunc(+event.target.value || 0),
                            ),
                          ),
                        },
                      }))
                    }
                  />
                  <small>{control.description}</small>
                </label>
              ) : (
                <label className="preview-check" key={control.key}>
                  <input
                    type="checkbox"
                    aria-label={`预览${control.label}`}
                    checked={!!preview.flags[control.key]}
                    onChange={(event) =>
                      setPreview((p) => ({
                        ...p,
                        flags: {
                          ...p.flags,
                          [control.key]: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>{control.label}</span>
                  <small>{control.description}</small>
                </label>
              ),
            )}
          <button
            className="preview-reset"
            onClick={() => setPreview(emptyPreview())}
          >
            清除预览条件
          </button>
        </div>
      </details>
      {result.warnings.length > 0 && (
        <details className="attribute-warnings">
          <summary>{result.warnings.length} 项效果未计入</summary>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="attribute-scope">
        已有明确公式的详情随治疗效果更新；不计算技能伤害或战斗循环。未计入项请展开核对。
      </p>
    </div>
  );
}
