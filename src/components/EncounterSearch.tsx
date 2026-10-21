import { useId, useState } from "react";

export type EncounterOption = {
  value: string;
  detail?: string;
  keywords?: string[];
};
export function EncounterSearch({
  label,
  ariaLabel,
  value,
  placeholder,
  options,
  change,
  select,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  placeholder: string;
  options: EncounterOption[];
  change: (value: string) => void;
  select: (option: EncounterOption) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = options.filter((option) =>
    [option.value, ...(option.keywords || [])].some((name) =>
      name.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()),
    ),
  );
  const visible = matches.slice(0, 40);
  const selected = Math.min(active, Math.max(0, visible.length - 1));
  function choose(option: EncounterOption) {
    select(option);
    setOpen(false);
    setActive(0);
  }
  return (
    <div
      className="encounter-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-label={ariaLabel}
        autoComplete="off"
        maxLength={60}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? `${id}-results` : undefined}
        aria-activedescendant={
          open && visible.length ? `${id}-option-${selected}` : undefined
        }
        value={value}
        placeholder={placeholder}
        onClick={() => setOpen(true)}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onChange={(event) => {
          change(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive(
              open
                ? (selected +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    visible.length) %
                    Math.max(1, visible.length)
                : 0,
            );
          }
          if (event.key === "Enter" && open) {
            event.preventDefault();
            if (visible.length) choose(visible[selected]);
            else setOpen(false);
          }
        }}
      />
      {open && (
        <div
          className="encounter-results"
          id={`${id}-results`}
          role="listbox"
          aria-label={`${label.replace(/（.*$/, "")}检索结果`}
        >
          {visible.map((option, index) => (
            <button
              type="button"
              role="option"
              tabIndex={-1}
              key={JSON.stringify(option)}
              id={`${id}-option-${index}`}
              aria-selected={index === selected}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <span>{option.value}</span>
              {option.detail && <small>{option.detail}</small>}
            </button>
          ))}
          {!visible.length && (
            <p className="muted">没有匹配项，可保留输入并添加自定义场景。</p>
          )}
          {matches.length > visible.length && (
            <p className="muted">仅显示前 40 项，继续输入可缩小范围。</p>
          )}
        </div>
      )}
    </div>
  );
}
