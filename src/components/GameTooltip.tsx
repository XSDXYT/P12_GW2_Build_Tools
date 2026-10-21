import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import type { Entity } from "../domain";
import { gameDetails, gameText, type DetailKind } from "../game-details";

type OpenDetail = {
  entity: Entity;
  kind: DetailKind;
  anchor: HTMLButtonElement;
};

/** A shared detail card for all visible skill/trait icons, independent of build edits. */
export function useGameTooltip(
  selectedTraits: ReadonlySet<number>,
  resetKey: string,
  healingPower?: number,
) {
  const id = useId();
  const [current, setCurrent] = useState<OpenDetail | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const active = useRef<OpenDetail | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const touchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const suppressClick = useRef<{ anchor: HTMLElement; until: number } | null>(
    null,
  );
  const skipFocus = useRef(false);
  const focusCard = useRef(false);
  function cancelTimers() {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    clearTimeout(touchTimer.current);
  }
  function dismiss(restoreFocus = false) {
    const anchor = active.current?.anchor;
    cancelTimers();
    active.current = null;
    setCurrent(null);
    if (
      restoreFocus &&
      anchor?.isConnected &&
      document.activeElement !== anchor
    ) {
      skipFocus.current = true;
      anchor.focus({ preventScroll: true });
    }
  }
  function show(
    anchor: HTMLButtonElement,
    entity: Entity,
    kind: DetailKind,
    focus = false,
  ) {
    cancelTimers();
    focusCard.current = focus;
    active.current = { anchor, entity, kind };
    setCurrent(active.current);
  }
  function scheduleClose() {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      const card = panel.current,
        anchor = active.current?.anchor;
      if (
        card?.matches(":hover") ||
        card?.contains(document.activeElement) ||
        anchor?.matches(":hover") ||
        anchor === document.activeElement
      )
        return;
      dismiss();
    }, 260);
  }
  useEffect(() => {
    dismiss();
  }, [resetKey]);
  useEffect(() => () => cancelTimers(), []);

  useLayoutEffect(() => {
    if (!current || !panel.current) return;
    const card = panel.current;
    const place = () => {
      if (!current.anchor.isConnected) {
        dismiss();
        return;
      }
      const anchor = current.anchor.getBoundingClientRect();
      const width = card.offsetWidth,
        height = card.offsetHeight;
      const margin = 12,
        gap = 9;
      let left: number, top: number;
      if (anchor.right + gap + width <= innerWidth - margin) {
        left = anchor.right + gap;
        top = anchor.top;
      } else if (anchor.left - gap - width >= margin) {
        left = anchor.left - gap - width;
        top = anchor.top;
      } else {
        left = anchor.left;
        top =
          anchor.bottom + gap + height <= innerHeight - margin
            ? anchor.bottom + gap
            : anchor.top - gap - height;
      }
      card.style.left = `${Math.max(margin, Math.min(left, innerWidth - width - margin))}px`;
      card.style.top = `${Math.max(margin, Math.min(top, innerHeight - height - margin))}px`;
      card.style.visibility = "visible";
    };
    place();
    if (focusCard.current) {
      card.focus({ preventScroll: true });
      focusCard.current = false;
    }
    const observer = new ResizeObserver(place);
    observer.observe(card);
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss(card.contains(document.activeElement));
      }
    };
    const outside = (event: globalThis.PointerEvent) => {
      if (
        event.target instanceof Node &&
        !card.contains(event.target) &&
        !current.anchor.contains(event.target)
      )
        dismiss();
    };
    const openedAt = { x: window.scrollX, y: window.scrollY };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && card.contains(event.target)) return;
      // Revealing an off-screen anchor can queue a scroll event before its
      // click opens the card. It must not close that newly opened card.
      if (
        (event.target === document || event.target === window) &&
        window.scrollX === openedAt.x &&
        window.scrollY === openedAt.y
      )
        return;
      dismiss();
    };
    document.addEventListener("keydown", escape, true);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", scroll, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [current]);

  function bind(entity: Entity | undefined, kind: DetailKind) {
    if (!entity) return {};
    return {
      "data-game-detail": `${kind}-${entity.id}`,
      "aria-describedby":
        current?.entity.id === entity.id && current.kind === kind
          ? `${id}-description`
          : undefined,
      onPointerEnter: (event: PointerEvent<HTMLButtonElement>) => {
        if (event.pointerType !== "mouse") return;
        cancelTimers();
        const anchor = event.currentTarget;
        openTimer.current = setTimeout(() => show(anchor, entity, kind), 140);
      },
      onPointerLeave: (event: PointerEvent<HTMLButtonElement>) => {
        clearTimeout(touchTimer.current);
        if (event.pointerType === "mouse") scheduleClose();
      },
      onFocus: (event: FocusEvent<HTMLButtonElement>) => {
        if (skipFocus.current) {
          skipFocus.current = false;
          return;
        }
        if (event.currentTarget.matches(":focus-visible"))
          show(event.currentTarget, entity, kind);
      },
      onBlur: (event: FocusEvent<HTMLButtonElement>) => {
        if (
          event.relatedTarget instanceof Node &&
          panel.current?.contains(event.relatedTarget)
        )
          return;
        scheduleClose();
      },
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "F1") {
          event.preventDefault();
          show(event.currentTarget, entity, kind, true);
        }
      },
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (event.pointerType !== "touch") return;
        clearTimeout(touchTimer.current);
        const anchor = event.currentTarget;
        touchTimer.current = setTimeout(() => {
          suppressClick.current = { anchor, until: Date.now() + 1200 };
          show(anchor, entity, kind);
        }, 480);
      },
      onPointerUp: () => clearTimeout(touchTimer.current),
      onPointerCancel: () => clearTimeout(touchTimer.current),
      onClickCapture: (event: MouseEvent<HTMLButtonElement>) => {
        if (
          suppressClick.current?.anchor === event.currentTarget &&
          suppressClick.current.until >= Date.now()
        ) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = null;
        }
      },
      onContextMenu: (event: MouseEvent<HTMLButtonElement>) => {
        if (active.current?.anchor === event.currentTarget)
          event.preventDefault();
      },
    };
  }
  const model = current
    ? gameDetails(current.entity, current.kind, selectedTraits, {
        healingPower,
      })
    : null;
  const facts = model?.facts || [];
  const content =
    current &&
    createPortal(
      <div
        ref={panel}
        id={id}
        className="game-tooltip"
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${id}-heading`}
        tabIndex={-1}
        style={{ visibility: "hidden" }}
        onPointerEnter={() => clearTimeout(closeTimer.current)}
        onPointerLeave={scheduleClose}
        onFocus={() => clearTimeout(closeTimer.current)}
        onBlur={(event) => {
          if (!(
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
          ))
            scheduleClose();
        }}
      >
        <div className="game-tooltip-heading">
          {current.entity.icon && <img src={current.entity.icon} alt="" />}
          <div>
            <small>{current.kind === "trait" ? "特性" : "技能"}</small>
            <h3 id={`${id}-heading`}>{current.entity.name}</h3>
          </div>
          <button
            type="button"
            aria-label="关闭技能与特性详情"
            onClick={() => dismiss(true)}
          >
            ×
          </button>
        </div>
        <p id={`${id}-description`} className="game-tooltip-description">
          {model?.description || "暂无说明。"}
        </p>
        {!!facts.length && (
          <h4>
            基础效果{" "}
            {model?.mode === "pve" && (
              <small className="game-tooltip-mode">PvE</small>
            )}
          </h4>
        )}
        {!!facts.length && (
          <ul className="game-tooltip-facts">
            {facts.map((fact, index) => (
              <li
                key={index}
                className={fact.modified ? "fact-modified" : ""}
                data-effect={fact.effectId}
                data-recipient={fact.audience?.kind}
              >
                {fact.prefixIcon && (
                  <img className="fact-prefix" src={fact.prefixIcon} alt="" />
                )}
                <span className="fact-icon">
                  {fact.icon ? <img src={fact.icon} alt="" /> : <span>◇</span>}
                  {fact.stacks != null && (
                    <b aria-hidden="true">{fact.stacks}</b>
                  )}
                </span>
                <div>
                  <span>
                    {fact.label}
                    {fact.detail && (
                      <>
                        ：<strong>{fact.detail}</strong>
                      </>
                    )}
                    {fact.modified && <em>特性修正</em>}
                  </span>
                  {(fact.recipient || fact.trigger) && (
                    <small className="fact-recipient">
                      {[fact.recipient, fact.trigger]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  )}
                  {fact.description && <small>{fact.description}</small>}
                  {fact.scaling && (
                    <small>
                      {fact.scaling.formula}（当前治疗效果{" "}
                      {fact.scaling.healingPower.toLocaleString("en-US")}）
                    </small>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!!model?.branches?.length && (
          <div className="game-tooltip-branches">
            <h4>
              形态与关联技能{" "}
              {!facts.length && (
                <small className="game-tooltip-mode">PvE</small>
              )}
            </h4>
            {model.branches.map((branch, index) => (
              <details key={index} className="game-tooltip-branch">
                <summary>{branch.label}</summary>
                <ul className="game-tooltip-facts">
                  {branch.facts.map((fact, row) => (
                    <li
                      key={row}
                      className={fact.modified ? "fact-modified" : ""}
                    >
                      <div>
                        <span>
                          {fact.label}
                          {fact.detail && (
                            <>
                              ：<strong>{fact.detail}</strong>
                            </>
                          )}
                          {fact.modified && <em>特性修正</em>}
                        </span>
                        {fact.trigger && (
                          <small className="fact-recipient">
                            {fact.trigger}
                          </small>
                        )}
                        {fact.scaling && (
                          <small>
                            {fact.scaling.formula}（当前治疗效果{" "}
                            {fact.scaling.healingPower.toLocaleString("en-US")}
                            ）
                          </small>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <a
                  href={branch.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  分支 Wiki 来源 ↗
                </a>
              </details>
            ))}
          </div>
        )}
        {!!(facts.length || model?.branches?.length) &&
          model?.mode === "pve" && (
            <p className="game-tooltip-note">
              {[
                ...facts,
                ...(model.branches || []).flatMap((b) => b.facts),
              ].some((f) => f.scaling)
                ? "治疗及屏障公式已计入当前治疗效果；额外治疗倍率未计算。其他效果显示基础值。"
                : "基础值，未计入配装加成。"}
            </p>
          )}
        {model?.notes?.map((note) => (
          <p key={note} className="game-tooltip-note">
            {note}
          </p>
        ))}
        {!!model?.selectedTraitNotes?.length && (
          <>
            <h4>已选特性联动</h4>
            <ul className="game-tooltip-facts">
              {model.selectedTraitNotes.map((trait) => (
                <li key={trait.id}>
                  <div>
                    <span>{trait.name}</span>
                    <small>{gameText(trait.description)}</small>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {model?.sourceUrl && (
          <a href={model.sourceUrl} target="_blank" rel="noopener noreferrer">
            {model.mode === "pve" ? "Wiki PvE 来源 ↗" : "在 Wiki 查看 ↗"}
          </a>
        )}
        <a
          href={`https://gw2.huijiwiki.com/wiki/${encodeURIComponent(current.entity.name)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          在中文维基查看 ↗
        </a>
      </div>,
      document.body,
    );
  return { bind, content, dismiss, show };
}
