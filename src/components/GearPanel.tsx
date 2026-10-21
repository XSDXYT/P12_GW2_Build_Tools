import { useAttributePreview } from "../hooks/useAttributePreview";
import { AttributePanel } from "./AttributePanel";
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
import {
  entityName,
  itemOptions,
  weaponNames,
  type EditorProps,
} from "../editor";
export function GearPanel({
  build,
  catalog,
  readonly,
  edit,
  pick,
  notify,
}: EditorProps) {
  const { weaponSet: activeSet, onWeaponSet: setActiveSet } =
    useAttributePreview();
  const p = catalog.professions.find((p) => p.id === build.profession);
  const runes = itemOptions(catalog, "Rune"),
    sigils = itemOptions(catalog, "Sigil"),
    infusions = itemOptions(catalog, "Infusion");
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
      displayName={
        namesOnly ? catalog.stats.find((s) => s.id === id)?.name : undefined
      }
      onSelect={(value) => edit((b) => change(b.equipment[key], value))}
    />
  );
  function infusionSlots(key: keyof Build["equipment"]) {
    const slot = build.equipment[key];
    if (!slot.infusions.length) return <span className="no-socket">—</span>;
    return (
      <details className="infusion">
        <summary
          aria-label={`${labels[key]}灌注 ${slot.infusions.filter(Boolean).length}/${slot.infusions.length}`}
        >
          <span>灌注</span>
          <b>
            {slot.infusions.filter(Boolean).length}/{slot.infusions.length}
          </b>
        </summary>
        <div className="infusion-fields">
          {slot.infusions.map((id, index) => (
            <div key={index}>
              <span>{index + 1}</span>
              {field(key, `灌注槽 ${index + 1}`, id, infusions, (s, value) => {
                s.infusions[index] = value;
              })}
            </div>
          ))}
        </div>
      </details>
    );
  }
  function gearRow(
    key: (typeof armorSlots)[number] | (typeof accessorySlots)[number],
  ) {
    const slot = build.equipment[key];
    const armor = armorSlots.includes(key as never);
    return (
      <div
        className={`equipment-row ${armor ? "armor-row" : "trinket-row"}`}
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
          field(key, "符文", slot.runeId, runes, (s, id) => {
            s.runeId = id;
          })}
        {infusionSlots(key)}
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
    if (parent && twoHanded.has(parent.weapon))
      return (
        <div className="weapon-row occupied" data-slot={key} key={key}>
          <span>{labels[key]}</span>
          <span>由双手武器占用</span>
        </div>
      );
    const options = Object.entries(p?.weapons || {}).filter(
      ([w, value]: [string, any]) =>
        !["Trident", "HarpoonGun"].includes(w) &&
        value.flags.includes(
          off ? "Offhand" : twoHanded.has(w) ? "TwoHand" : "Mainhand",
        ),
    );
    return (
      <div className="weapon-row" data-slot={key} key={key}>
        <div className="weapon-identity">
          <label>
            {labels[key]}
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
        <div className="weapon-upgrades">
          {Array.from(
            { length: twoHanded.has(slot.weapon) ? 2 : 1 },
            (_, index) => (
              <div className="labeled-choice" key={index}>
                <span>法印 {index + 1}</span>
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
          {infusionSlots(key)}
        </div>
      </div>
    );
  }
  const counts: Record<number, number> = {};
  for (const [key, slot] of Object.entries(build.equipment)) {
    if (weaponSlots.includes(key as never) && !key.endsWith(String(activeSet)))
      continue;
    for (const id of slot.infusions) if (id) counts[id] = (counts[id] || 0) + 1;
  }
  return (
    <section className="panel gear-panel" aria-labelledby="gear-heading">
      <header className="panel-heading">
        <div>
          <span className="section-index">01</span>
          <h2 id="gear-heading">
            装备 <small>GEAR</small>
          </h2>
        </div>
        {!readonly && (
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
        )}
      </header>
      <div className="gear-grid">
        <div className="gear-column">
          <h3>
            护甲 <small>ARMOR</small>
          </h3>
          <div className="row-labels armor-labels">
            <span>槽位</span>
            <span>属性词条</span>
            <span>符文</span>
            <span>灌注</span>
          </div>
          {armorSlots.map(gearRow)}
        </div>
        <div className="gear-column">
          <h3>
            饰品 <small>TRINKETS</small>
          </h3>
          <div className="row-labels trinket-labels">
            <span>槽位</span>
            <span>属性词条</span>
            <span>灌注</span>
          </div>
          {accessorySlots.map(gearRow)}
        </div>
      </div>
      <div className="weapon-groups">
        {[1, 2].map((set) => (
          <div className="weapon-group" key={set}>
            <h3>
              武器组 {set === 1 ? "Ⅰ" : "Ⅱ"}
              <small>{set === 1 ? "PRIMARY" : "ALTERNATE · 可选"}</small>
            </h3>
            {weaponRow(`weapon${set}` as "weapon1")}
            {weaponRow(`offhand${set}` as "offhand1")}
          </div>
        ))}
      </div>
      <div className="gear-extras">
        <div className="upgrades-card">
          <h3>
            古物与消耗品 <small>EXTRAS</small>
          </h3>
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
                onSelect={(id) =>
                  edit((b) => {
                    b[key] = id;
                  })
                }
              />
            </div>
          ))}
        </div>
        <div className="infusion-total">
          <h3>
            灌注汇总{" "}
            <small>
              {Object.values(counts).reduce((a, b) => a + b, 0)} / 当前武器组
            </small>
          </h3>
          <div className="segmented" aria-label="灌注汇总武器组">
            {[1, 2].map((set) => (
              <button
                key={set}
                aria-pressed={activeSet === set}
                onClick={() => setActiveSet(set as 1 | 2)}
              >
                武器组 {set === 1 ? "Ⅰ" : "Ⅱ"}
              </button>
            ))}
          </div>
          {Object.keys(counts).length ? (
            <ul>
              {Object.entries(counts).map(([id, count]) => (
                <li key={id}>
                  <span>{entityName(+id, infusions)}</span>
                  <b>× {count}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">展开装备行的灌注槽进行配置。</p>
          )}
        </div>
      </div>
      <AttributePanel />
    </section>
  );
}
