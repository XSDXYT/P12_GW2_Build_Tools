import type { Entity } from "../domain";
import { entityName, type Pick } from "../editor";
type Props = {
  label: string;
  context?: string;
  id: number | null;
  options: Entity[];
  pick: Pick;
  onSelect: (id: number | null) => void;
  namesOnly?: boolean;
  displayName?: string;
  className?: string;
  icon?: string;
};
export function ChoiceField({
  label,
  context,
  id,
  options,
  pick,
  onSelect,
  namesOnly,
  displayName,
  className = "",
  icon,
}: Props) {
  const name = displayName || entityName(id, options);
  const selected =
    namesOnly && displayName
      ? options.find((item) => item.name === displayName)?.id || null
      : id;
  return (
    <button
      type="button"
      className={`choice-field ${!id ? "unselected" : ""} ${className}`}
      aria-label={`${context || ""}${label}：${name}`}
      title={name}
      onClick={(event) =>
        pick({
          title: context ? `${context} · ${label}` : label,
          options,
          selected,
          onSelect,
          anchor: event.currentTarget,
          namesOnly,
        })
      }
    >
      {icon && (
        <img
          key={icon}
          className="choice-icon"
          src={icon}
          alt=""
          width={24}
          height={24}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
      <span className="choice-value">{name}</span>
      <span className="choice-arrow" aria-hidden="true">
        ⌄
      </span>
    </button>
  );
}
