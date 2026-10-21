import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { describe, matchOption, type PickerRequest } from "../editor";
export function Picker({
  request,
  readonly,
  onClose,
}: {
  request: PickerRequest;
  readonly: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [compact] = useState(
    () => window.matchMedia("(max-width: 720px)").matches,
  );
  const root = useRef<HTMLDialogElement & HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    results = useRef<HTMLDivElement>(null);
  const matches = request.options.filter((item) => matchOption(item, query));
  const chosen = request.options.find((item) => item.id === request.selected);
  const [limit, setLimit] = useState(100);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    if (compact) (element as unknown as HTMLDialogElement).showModal();
    else element.showPopover();
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (!coarse && !readonly) input.current?.focus();
    else
      element
        .querySelector<HTMLElement>(".picker-close")
        ?.focus({ preventScroll: true });
    const position = () => {
      if (compact) return;
      const anchor = request.anchor.getBoundingClientRect();
      const width = Math.min(readonly ? 360 : 420, innerWidth - 24);
      element.style.width = width + "px";
      const availableBelow = innerHeight - anchor.bottom - 18;
      const availableAbove = anchor.top - 18;
      const goBelow =
        availableBelow >=
          Math.min(330, element.getBoundingClientRect().height) ||
        availableBelow >= availableAbove;
      element.style.maxHeight =
        Math.min(
          560,
          Math.max(180, goBelow ? availableBelow : availableAbove),
          innerHeight - 24,
        ) + "px";
      const height = element.getBoundingClientRect().height;
      const left = Math.max(12, Math.min(anchor.left, innerWidth - width - 12));
      const below = anchor.bottom + 6;
      const top = Math.max(
        12,
        Math.min(
          goBelow ? below : anchor.top - height - 6,
          innerHeight - height - 12,
        ),
      );
      element.style.left = left + "px";
      element.style.top = top + "px";
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      // Release the native modal before focusing its previously inert trigger.
      if (compact) element.close();
      if (request.anchor.isConnected)
        request.anchor.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const toggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "closed") onClose();
    };
    element.addEventListener("toggle", toggle);
    return () => element.removeEventListener("toggle", toggle);
  }, [onClose]);
  function select(id: number | null) {
    request.onSelect(id);
    onClose();
  }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (
      event.nativeEvent.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    const buttons = Array.from(
      results.current?.querySelectorAll<HTMLButtonElement>(
        '[role="option"]:not(:disabled)',
      ) || [],
    );
    if (event.target === input.current && event.key === "Enter") {
      event.preventDefault();
      buttons[0]?.click();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (event.target === input.current && ["Home", "End"].includes(event.key))
      return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : event.key === "ArrowDown"
            ? (index + 1) % buttons.length
            : index <= 0
              ? buttons.length - 1
              : index - 1;
    buttons[next]?.focus();
  }
  const content = (
    <>
      <div className="picker-heading">
        <h2>{request.title}</h2>
        <button
          type="button"
          className="picker-close"
          aria-label="关闭选择器"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {readonly ? (
        <div className="item-inspection">
          {chosen ? (
            <>
              <strong>{chosen.name}</strong>
              {!request.namesOnly && <p>{describe(chosen)}</p>}
            </>
          ) : (
            <p>尚未配置</p>
          )}
        </div>
      ) : (
        <>
          <input
            ref={input}
            className="search"
            type="search"
            aria-label="搜索选项"
            placeholder={
              request.namesOnly ? "搜索词条名称…" : "搜索名称或物品 ID…"
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(100);
              if (results.current) results.current.scrollTop = 0;
            }}
            autoComplete="off"
          />
          <div className="picker-count">
            {matches.length} 个可选项<span>↑ ↓ 选择 · Enter 确认</span>
          </div>
          <div
            className="picker-results"
            ref={results}
            role="listbox"
            aria-label={request.title}
          >
            <button
              type="button"
              className="option clear"
              onClick={() => select(null)}
            >
              {request.clearLabel || "清除此槽位"}
            </button>
            {matches.slice(0, limit).map((item) => {
              const disabled = request.disabledIds?.includes(item.id);
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={request.selected === item.id}
                  disabled={disabled}
                  className={`option ${request.selected === item.id ? "chosen" : ""}`}
                  key={item.id}
                  onClick={() => select(item.id)}
                >
                  {request.icons && item.icon && <img src={item.icon} alt="" />}
                  <span>
                    <strong>{item.name}</strong>
                    {!request.namesOnly && <small>{describe(item)}</small>}
                    {disabled && <small>已在其他槽位使用</small>}
                  </span>
                  {request.selected === item.id && (
                    <span className="selection-check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
            {matches.length === 0 && (
              <div className="no-results" role="status">
                没有匹配的选项<small>试试更短的名称，或清空搜索。</small>
              </div>
            )}
            {matches.length > limit && (
              <button
                className="show-more"
                onClick={() => setLimit((value) => value + 100)}
              >
                显示更多（剩余 {matches.length - limit} 项）
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
  const shared = {
    ref: root,
    className: `picker ${compact ? "picker-sheet" : "picker-popover"}`,
    onKeyDown: keyboard,
    "aria-label": request.title,
  };
  return compact ? (
    <dialog
      {...shared}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientY < rect.top ||
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      {content}
    </dialog>
  ) : (
    <div {...shared} popover="auto" role="dialog">
      {content}
    </div>
  );
}
