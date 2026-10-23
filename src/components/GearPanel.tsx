import { useState } from "react";
import { AttributePanel } from "./AttributePanel";
import { InfusionEditor } from "./InfusionEditor";
import {
  armorSlots,
  accessorySlots,
  weaponSlots,
  labels,
  statOptions,
  twoHanded,
  commonStatOptions,
  applyEquipmentStat,
  type Build,
  type Slot,
} from "../domain";
import { ChoiceField } from "./ChoiceField";
import { jadeCore } from "../profession-mechanics";
import equipmentIcons from "../data/equipment-icons.json";
import {
  entityName,
  itemOptions,
  weaponNames,
  type EditorProps,
} from "../editor";

const itemIcon = (id: number | null) => {
  const path = id && (equipmentIcons.icons as Record<string, string>)[id];
  return path ? `https://render.guildwars2.com/file/${path}` : undefined;
};

export function GearPanel({
  build,
  catalog,
  readonly,
  edit,
  pick,
  notify,
}: EditorProps) {
  const [runeDetails, setRuneDetails] = useState(false);
  const p = catalog.professions.find((p) => p.id === build.profession);
  const runes = itemOptions(catalog, "Rune"),
    sigils = itemOptions(catalog, "Sigil");
  const field = (
    key: keyof Build["equipment"],
    label: string,
    id: number | null,
    options: typeof catalog.items,
    change: (slot: Slot, id: number | null) => void,
    namesOnly = false,
  ) => (
    <ChoiceField
      label={label}
      context={labels[key]}
      id={id}
      options={options}
      pick={pick}
      namesOnly={namesOnly}
      icon={namesOnly ? undefined : itemIcon(id)}
      displayName={
        namesOnly ? catalog.stats.find((s) => s.id === id)?.name : undefined
      }
      onSelect={(value) => edit((b) => change(b.equipment[key], value))}
    />
  );
  function gearRow(
    key: (typeof armorSlots)[number] | (typeof accessorySlots)[number],
  ) {
    const slot = build.equipment[key];
    const armor = armorSlots.includes(key as never);
    return (
      <div
        className={`equipment-row ${armor ? `armor-row${runeDetails ? " with-runes" : ""}` : "trinket-row"}`}
        data-slot={key}
        key={key}
      >
        <span className="slot-label">{labels[key]}</span>
        {field(
          key,
          "属性",
          slot.statId,
          statOptions(catalog, key),
          (s, id) => {
            s.statId = id;
          },
          true,
        )}
        {armor &&
          runeDetails &&
          field(key, "符文", slot.runeId, runes, (s, id) => {
            s.runeId = id;
          })}
      </div>
    );
  }
  function weaponRow(key: (typeof weaponSlots)[number]) {
    const slot = build.equipment[key],
      off = key.startsWith("offhand");
    const parent =
      key === "offhand1"
        ? build.equipment.weapon1
        : key === "offhand2"
          ? build.equipment.weapon2
          : null;
    if (parent && twoHanded.has(parent.weapon)) return null;
    const options = Object.entries(p?.weapons || {}).filter(
      ([w, value]: [string, any]) =>
        !["Trident", "HarpoonGun"].includes(w) &&
        value.flags.includes(
          off ? "Offhand" : twoHanded.has(w) ? "TwoHand" : "Mainhand",
        ),
    );
    return (
      <div
        className={`weapon-row${twoHanded.has(slot.weapon) ? " two-handed" : ""}`}
        data-slot={key}
        key={key}
      >
        <div className="weapon-identity">
          <label>
            <span className="weapon-hand">{off ? "副手" : "主手"}</span>
            <select
              aria-label={`${labels[key]}武器类型`}
              value={slot.weapon}
              disabled={readonly}
              onChange={(event) =>
                edit((b) => {
                  const target = b.equipment[key];
                  const weapon = event.target.value;
                  target.weapon = weapon;
                  target.sigils = [null, null];
                  target.infusions = Array(twoHanded.has(weapon) ? 2 : 1).fill(
                    null,
                  );
                  if (twoHanded.has(weapon)) {
                    const offhand = key === "weapon1" ? "offhand1" : "offhand2";
                    b.equipment[offhand] = {
                      weapon: "",
                      statId: null,
                      runeId: null,
                      sigils: [null, null],
                      infusions: [],
                    };
                  }
                })
              }
            >
              <option value="">选择武器</option>
              {options.map(([weapon]) => (
                <option value={weapon} key={weapon}>
                  {weaponNames[weapon] || weapon}
                </option>
              ))}
            </select>
          </label>
          {field(
            key,
            "属性",
            slot.statId,
            statOptions(catalog, key),
            (s, id) => {
              s.statId = id;
            },
            true,
          )}
        </div>
        {twoHanded.has(slot.weapon) && (
          <span className="weapon-grip" title="副手由双手武器占用">
            双手 · 占用副手
          </span>
        )}
        <div className="weapon-upgrades">
          {Array.from(
            { length: twoHanded.has(slot.weapon) ? 2 : 1 },
            (_, index) => (
              <div className="labeled-choice" key={index}>
                <span className="sr-only">法印 {index + 1}</span>
                {field(
                  key,
                  `法印 ${index + 1}`,
                  slot.sigils[index] || null,
                  sigils,
                  (s, id) => {
                    s.sigils[index] = id;
                  },
                )}
              </div>
            ),
          )}
        </div>
      </div>
    );
  }
  const runeCounts = new Map<number | null, number>();
  for (const key of armorSlots) {
    const id = build.equipment[key].runeId;
    runeCounts.set(id, (runeCounts.get(id) || 0) + 1);
  }
  return (
    <section className="panel gear-panel" aria-labelledby="gear-heading">
      <header className="panel-heading">
        <div>
          <h2 id="gear-heading">
            装备 <small>GEAR</small>
          </h2>
        </div>
        {!readonly && (
          <div className="gear-batch-actions">
            <button
              className="batch-stats"
              onClick={(event) =>
                pick({
                  title: "整套装备词条",
                  options: commonStatOptions(catalog),
                  selected: null,
                  namesOnly: true,
                  anchor: event.currentTarget,
                  onSelect: (id) => {
                    if (!id) return;
                    edit((b) => {
                      const total = applyEquipmentStat(b, catalog, id);
                      notify(
                        `已为 ${total} 个装备槽位设置${catalog.stats.find((s) => s.id === id)?.name}。`,
                      );
                    }, "整套词条设置");
                  },
                })
              }
            >
              整套词条 <span>⌄</span>
            </button>
            <button
              type="button"
              className="batch-stats"
              onClick={(event) =>
                pick({
                  title: "整套护甲符文",
                  options: runes,
                  selected: armorSlots.every(
                    (key) =>
                      build.equipment[key].runeId ===
                      build.equipment.head.runeId,
                  )
                    ? build.equipment.head.runeId
                    : null,
                  clearLabel: "清空六件护甲符文",
                  anchor: event.currentTarget,
                  onSelect: (id) => {
                    edit((b) => {
                      for (const key of armorSlots)
                        b.equipment[key].runeId = id;
                    }, "整套符文设置");
                    notify(
                      id
                        ? `已为 6 件护甲设置${entityName(id, runes)}。`
                        : "已清空六件护甲符文。",
                    );
                  },
                })
              }
            >
              整套符文 <span>⌄</span>
            </button>
          </div>
        )}
      </header>
      <div className="gear-grid">
        <div className="gear-column">
          <h3 id="armor-heading">
            护甲
            <button
              type="button"
              className="rune-details-toggle"
              aria-expanded={runeDetails}
              aria-controls="armor-slots"
              onClick={() => setRuneDetails(!runeDetails)}
            >
              {runeDetails ? "收起逐件符文" : "逐件符文"}
              <span aria-hidden="true">{runeDetails ? "−" : "+"}</span>
            </button>
          </h3>
          <div className="gear-group-summary" aria-label="护甲符文汇总">
            <span className="group-summary-label">符文</span>
            <div className="group-summary-values">
              {[...runeCounts].map(([id, count]) => (
                <span key={id || "empty"} className={id ? "" : "muted"}>
                  {itemIcon(id) && (
                    <img
                      src={itemIcon(id)}
                      alt=""
                      width={22}
                      height={22}
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                  {entityName(id, runes, "未配置")} <b>×{count}</b>
                </span>
              ))}
            </div>
          </div>
          <div
            className={`row-labels armor-labels${runeDetails ? " with-runes" : ""}`}
          >
            <span>槽位</span>
            <span>属性词条</span>
            {runeDetails && <span>符文</span>}
          </div>
          <div id="armor-slots" aria-labelledby="armor-heading">
            {armorSlots.map(gearRow)}
          </div>
        </div>
        <div className="gear-column">
          <h3>饰品</h3>
          <div className="row-labels trinket-labels">
            <span>槽位</span>
            <span>属性词条</span>
          </div>
          {accessorySlots.map(gearRow)}
        </div>
      </div>
      <div className="weapon-groups">
        {[1, 2].map((set) => (
          <div className="weapon-group" key={set}>
            <h3>
              武器组 {set === 1 ? "Ⅰ" : "Ⅱ"}
              <small>
                {[`weapon${set}`, `offhand${set}`]
                  .map(
                    (key) =>
                      build.equipment[key as keyof Build["equipment"]].weapon,
                  )
                  .filter(Boolean)
                  .map((weapon) => weaponNames[weapon] || weapon)
                  .join(" / ") || (set === 2 ? "可选" : "未配置")}
              </small>
            </h3>
            {weaponRow(`weapon${set}` as "weapon1")}
            {weaponRow(`offhand${set}` as "offhand1")}
          </div>
        ))}
      </div>
      <div className="gear-extras">
        <div className="upgrades-card">
          <h3>古物与消耗品</h3>
          {(["relic", "food", "utility"] as const).map((key, index) => (
            <div className="labeled-choice" key={key}>
              <span>{["古物", "食物", "扳手"][index]}</span>
              <ChoiceField
                label={["古物", "食物", "扳手"][index]}
                id={build[key]}
                options={itemOptions(
                  catalog,
                  ["Relic", "Food", "Utility"][index],
                )}
                pick={pick}
                icon={itemIcon(build[key])}
                onSelect={(id) =>
                  edit((b) => {
                    b[key] = id;
                  })
                }
              />
            </div>
          ))}
          <div className="labeled-choice">
            <span>翠玉核心</span>
            <ChoiceField
              label="翠玉核心"
              id={build.jadeBotCore || null}
              options={[jadeCore]}
              pick={pick}
              icon={build.jadeBotCore ? jadeCore.icon : undefined}
              onSelect={(id) =>
                edit((b) => {
                  if (id) b.jadeBotCore = 96613;
                  else delete b.jadeBotCore;
                })
              }
            />
          </div>
          {build.jadeBotCore && (
            <p className="weapon-skills-note">10 级翠玉核心 · PvE 体力 +235</p>
          )}
        </div>
      </div>
      <InfusionEditor
        build={build}
        catalog={catalog}
        readonly={readonly}
        edit={edit}
        pick={pick}
        notify={notify}
      />
      <AttributePanel />
    </section>
  );
}
