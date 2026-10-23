import { useEffect, useId, useRef, useState } from "react";
import { ChoiceField } from "./ChoiceField";
import { useAttributePreview } from "../hooks/useAttributePreview";
import {
  currentInfusions,
  infusionName,
  infusionOptions,
  infusionParts,
  mergeInfusions,
} from "../infusions";
import type { InfusionGroup } from "../domain";
import type { EditorProps } from "../editor";

function NumberField({
  label,
  value,
  max,
  readonly,
  onChange,
  notify,
}: {
  label: string;
  value: number;
  max: number;
  readonly: boolean;
  onChange: (value: number) => void;
  notify: (message: string) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const errorId = useId();
  useEffect(() => setDraft(String(value)), [value]);
  const valid =
    /^\d+$/.test(draft) && Number(draft) >= 1 && Number(draft) <= max;
  return (
    <>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        step={1}
        aria-label={label}
        aria-invalid={!valid}
        aria-describedby={!valid && draft ? errorId : undefined}
        name={label}
        autoComplete="off"
        readOnly={readonly}
        value={draft}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const next = Number(text);
          if (/^\d+$/.test(text) && next >= 1 && next <= max) onChange(next);
        }}
        onBlur={() => {
          if (!valid) {
            setDraft(String(value));
            notify(`${label}请输入 1–${max} 的整数，已保留原值。`);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      {!valid && draft && (
        <small className="infusion-number-error" id={errorId} role="alert">
          请输入 1–{max} 的整数
        </small>
      )}
    </>
  );
}

export function InfusionEditor({
  build,
  catalog,
  readonly,
  edit,
  pick,
  notify,
}: EditorProps) {
  const { weaponSet, onWeaponSet } = useAttributePreview();
  const groups = currentInfusions(build, weaponSet);
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const agony = groups.reduce(
    (sum, group) =>
      sum +
      infusionParts(catalog.items.find((item) => item.id === group.id)).agony *
        group.count,
    0,
  );
  const options = infusionOptions(catalog);
  const addButton = useRef<HTMLButtonElement>(null);
  const rowButtons = useRef(new Map<number, HTMLDivElement>());
  const nextFocus = useRef<number | null>(null);
  useEffect(() => {
    if (nextFocus.current === null) return;
    const next = rowButtons.current
      .get(nextFocus.current)
      ?.querySelector("button");
    (next || addButton.current)?.focus({ preventScroll: true });
    nextFocus.current = null;
  }, [groups]);
  function save(next: InfusionGroup[], undoLabel?: string) {
    edit((draft) => {
      draft.infusionLoadouts ||= {};
      draft.infusionLoadouts[weaponSet] = mergeInfusions(next);
    }, undoLabel);
  }
  const change = (index: number, patch: Partial<InfusionGroup>) =>
    save(
      groups.map((group, i) =>
        i === index ? { ...group, ...patch } : { ...group },
      ),
    );
  return (
    <div className="infusion-total" aria-label="灌注配置">
      <div className="infusion-total-heading">
        <h3>
          灌注 <small>{total} / 18 枚</small>
        </h3>
        <div className="segmented" aria-label="灌注汇总武器组">
          {([1, 2] as const).map((set) => (
            <button
              type="button"
              key={set}
              aria-pressed={weaponSet === set}
              disabled={set === 2 && !build.equipment.weapon2.weapon}
              onClick={() => onWeaponSet(set)}
            >
              武器组 {set === 1 ? "Ⅰ" : "Ⅱ"}
            </button>
          ))}
        </div>
      </div>
      <div className="infusion-editor-summary">
        <span>
          痛苦抗性 <b>+{agony}</b>
        </span>
        {!readonly && <span>单枚属性默认 +5，最高 +30</span>}
      </div>
      {!!groups.length && (
        <div
          className={`infusion-group-labels${readonly ? " is-readonly" : ""}`}
          aria-hidden="true"
        >
          <span>灌注类型</span>
          <span>单枚属性</span>
          <span>数量</span>
          {!readonly && <span />}
        </div>
      )}
      <div className="infusion-group-list">
        {groups.map((group, index) => {
          const item = catalog.items.find((item) => item.id === group.id);
          const { primary } = infusionParts(item);
          const inspection = item && {
            id: item.id,
            name: infusionName(item, group.attributeValue),
            details: {
              infix_upgrade: {
                attributes: (item.details?.infix_upgrade?.attributes || []).map(
                  (entry: { attribute: string; modifier: number }) => ({
                    ...entry,
                    modifier:
                      entry.attribute === primary?.attribute
                        ? (group.attributeValue ?? entry.modifier)
                        : entry.modifier,
                  }),
                ),
              },
            },
          };
          return (
            <div
              className={`infusion-group-row${readonly ? " is-readonly" : ""}`}
              key={index}
              ref={(node) => {
                if (node) rowButtons.current.set(index, node);
                else rowButtons.current.delete(index);
              }}
            >
              <ChoiceField
                label={`灌注 ${index + 1}`}
                id={group.id}
                options={readonly && inspection ? [inspection] : options}
                displayName={infusionName(item, group.attributeValue)}
                pick={pick}
                onSelect={(id) => {
                  if (id === null) {
                    nextFocus.current = Math.min(index, groups.length - 2);
                    save(
                      groups.filter((_, i) => i !== index),
                      "移除灌注",
                    );
                  } else change(index, { id, attributeValue: undefined });
                }}
              />
              <label className="infusion-number-field">
                <span>单枚属性</span>
                {primary ? (
                  <NumberField
                    label={`灌注 ${index + 1} 单枚属性`}
                    value={group.attributeValue ?? primary.modifier}
                    max={30}
                    readonly={readonly}
                    notify={notify}
                    onChange={(attributeValue) =>
                      change(index, {
                        attributeValue:
                          attributeValue === primary.modifier
                            ? undefined
                            : attributeValue,
                      })
                    }
                  />
                ) : (
                  <span className="infusion-no-attribute">—</span>
                )}
              </label>
              <label className="infusion-number-field">
                <span>数量</span>
                <NumberField
                  label={`灌注 ${index + 1} 数量`}
                  value={group.count}
                  max={18 - total + group.count}
                  readonly={readonly}
                  notify={notify}
                  onChange={(count) => change(index, { count })}
                />
              </label>
              {!readonly && (
                <button
                  type="button"
                  className="infusion-remove"
                  aria-label={`移除灌注 ${index + 1}`}
                  onClick={() => {
                    nextFocus.current = Math.min(index, groups.length - 2);
                    save(
                      groups.filter((_, i) => i !== index),
                      "移除灌注",
                    );
                  }}
                >
                  <span aria-hidden="true">×</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
      {!groups.length && (
        <p className="muted">
          {readonly ? "未配置灌注。" : "选择一种灌注，再填写数量。"}
        </p>
      )}
      {!readonly && (
        <button
          type="button"
          className="infusion-add"
          ref={addButton}
          disabled={total >= 18}
          onClick={(event) =>
            pick({
              title: "添加灌注",
              options,
              selected: null,
              clearLabel: "取消添加",
              anchor: event.currentTarget,
              onSelect: (id) => {
                if (id) save([...groups, { id, count: 1 }], "添加灌注");
              },
            })
          }
        >
          <span aria-hidden="true">＋</span> 添加灌注
        </button>
      )}
    </div>
  );
}
