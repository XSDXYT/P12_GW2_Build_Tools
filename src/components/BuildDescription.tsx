import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EditorProps } from "../editor";
import { activeTraits } from "../attributes";
import {
  parseReference,
  referenceIndex,
  referenceMarkdown,
  searchReferences,
  slashQuery,
  type BuildReference,
} from "../build-references";
import { useGameTooltip } from "./GameTooltip";
import { useAttributePreview } from "../hooks/useAttributePreview";
import { BuildProperties } from "./BuildProperties";
import { MarkdownStyle } from "./MarkdownStyle";
import { MarkdownTableInsert } from "./MarkdownTableInsert";
import { insertMarkdownTable } from "../markdown-table";
import { useDescriptionAppearance } from "../hooks/useDescriptionAppearance";
import { classicDescriptionStyle } from "../markdown-style";
import {
  MarkdownStylePicker,
  type MarkdownStyleSession,
} from "./MarkdownStylePicker";

const ReferenceContext = createContext<{
  references: Map<string, BuildReference>;
  tooltip: ReturnType<typeof useGameTooltip>;
} | null>(null);
// Stable component identity preserves the anchor while opening its tooltip.
function ReferenceLink({ href = "", children }: ComponentProps<"a">) {
  const context = useContext(ReferenceContext)!;
  const parsed = parseReference(href);
  if (parsed) {
    const reference = context.references.get(`${parsed.kind}/${parsed.id}`);
    if (!reference)
      return (
        <span className="reference-missing" title="当前资料中没有此引用">
          {children}
        </span>
      );
    return (
      <button
        type="button"
        className="build-reference"
        {...context.tooltip.bind(reference.entity, reference.kind)}
        onClick={(event) =>
          context.tooltip.show(
            event.currentTarget,
            reference.entity,
            reference.kind,
          )
        }
      >
        {reference.entity.icon && (
          <img src={reference.entity.icon} alt="" loading="lazy" />
        )}
        {children}
      </button>
    );
  }
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}
const markdownComponents = { a: ReferenceLink };

export function BuildDescription({
  build,
  catalog,
  readonly,
  edit,
}: EditorProps) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const appearance = useDescriptionAppearance(build, readonly);
  const [cursor, setCursor] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [stylesOpen, setStylesOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const selection = useRef<{
    start: number;
    end: number;
    direction: "forward" | "backward" | "none";
    scroll: number;
  } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const styleSession = useRef<MarkdownStyleSession | null>(null);
  const id = useId();
  const index = useMemo(() => referenceIndex(catalog), [catalog]);
  const references = useMemo(
    () =>
      new Map(
        index.map((reference) => [
          `${reference.kind}/${reference.entity.id}`,
          reference,
        ]),
      ),
    [index],
  );
  const { result } = useAttributePreview();
  const tooltip = useGameTooltip(
    new Set(activeTraits(build, catalog).map((t) => t.id)),
    `${build.id}:${build.profession}:${mode}`,
    result?.primary.Healing,
    result?.controlDurationBonus,
    result || {},
  );
  const text = build.description || "";
  const query =
    !readonly && mode === "edit" && !dismissed
      ? slashQuery(text, cursor)
      : undefined;
  const matches = query ? searchReferences(index, query.query, category) : [];
  const visible = matches.slice(0, 40);
  const active = Math.min(selected, Math.max(0, visible.length - 1));
  function change(value: string, position: number) {
    if (value.length > 60000) return;
    edit((draft) => {
      if (value) draft.description = value;
      else delete draft.description;
    });
    setCursor(position);
    setDismissed(false);
    setSelected(0);
  }
  function insert(
    value: string,
    start: number,
    end: number,
    caretOffset = value.length,
  ) {
    const next = text.slice(0, start) + value + text.slice(end);
    if (next.length > 60000) return;
    change(next, start + caretOffset);
    setDismissed(true);
    requestAnimationFrame(() => {
      input.current?.focus({ preventScroll: true });
      input.current?.setSelectionRange(
        start + caretOffset,
        start + caretOffset,
      );
    });
  }
  function choose(reference: BuildReference) {
    if (!query) return;
    insert(referenceMarkdown(reference), query.start, cursor);
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!query || event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setDismissed(true);
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelected(
        (active + (event.key === "ArrowDown" ? 1 : -1) + visible.length) %
          Math.max(1, visible.length),
      );
    }
    if (event.key === "Enter" && visible.length) {
      event.preventDefault();
      choose(visible[active]);
    }
  }
  const preview = readonly || mode === "preview";
  const enlarged = expanded && !readonly;
  function resizeEditor() {
    if (input.current) {
      selection.current = {
        start: input.current.selectionStart,
        end: input.current.selectionEnd,
        direction: input.current.selectionDirection,
        scroll: input.current.scrollTop,
      };
    }
    tooltip.dismiss();
    setDismissed(true);
    setExpanded(!enlarged);
  }
  useLayoutEffect(() => {
    const modal = dialog.current;
    if (enlarged) modal?.showModal();
    const saved = selection.current;
    if (input.current && saved) {
      input.current.setSelectionRange(saved.start, saved.end, saved.direction);
      input.current.scrollTop = saved.scroll;
    }
    if (enlarged) input.current?.focus({ preventScroll: true });
    else if (saved)
      (expandButton.current || previewButton.current)?.focus({
        preventScroll: true,
      });
    if (!enlarged) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      modal?.close();
      document.body.style.overflow = overflow;
    };
  }, [enlarged]);
  const content = (
    <>
      <div className="description-heading">
        <h3 id={`${id}-heading`}>BD 描述与讲解</h3>
        <div className="description-actions">
          <button
            type="button"
            className="description-style-toggle"
            aria-expanded={stylesOpen}
            aria-controls={`${id}-styles`}
            title="展开或收起CSS样式，可选择模板、设置默认样式或加载CSS文件。"
            onClick={() => setStylesOpen((open) => !open)}
          >
            CSS 样式
          </button>
          {!readonly && (
            <div role="tablist" aria-label="描述模式">
              <button
                role="tab"
                aria-selected={!preview}
                onClick={() => {
                  setMode("edit");
                  tooltip.dismiss();
                }}
              >
                编辑
              </button>
              <button
                ref={previewButton}
                role="tab"
                aria-selected={preview}
                onClick={() => {
                  setMode("preview");
                  tooltip.dismiss();
                }}
              >
                预览
              </button>
            </div>
          )}
          {!readonly && (!preview || enlarged) && (
            <button
              ref={expandButton}
              type="button"
              className="description-expand"
              aria-haspopup={enlarged ? undefined : "dialog"}
              aria-controls={`${id}-expanded`}
              aria-expanded={enlarged}
              onClick={resizeEditor}
            >
              {enlarged ? "收起窗口" : "放大编辑"}
            </button>
          )}
        </div>
      </div>
      <div
        id={`${id}-styles`}
        className="description-style-panel"
        hidden={!stylesOpen}
      >
        <MarkdownStylePicker
          session={styleSession}
          value={appearance.style}
          readonlyView={readonly}
          defaultStyle={appearance.defaultStyle}
          setDefault={appearance.setDefault}
          restoreAuthor={
            readonly && appearance.overridden
              ? appearance.restoreAuthor
              : undefined
          }
          onChange={(style) => {
            tooltip.dismiss();
            if (readonly) {
              appearance.selectForViewing(style);
              return;
            }
            edit((draft) => {
              if (style) draft.descriptionStyle = style;
              else if (appearance.defaultStyle)
                draft.descriptionStyle = classicDescriptionStyle;
              else delete draft.descriptionStyle;
            });
          }}
        />
      </div>
      {preview ? (
        <MarkdownStyle
          style={appearance.style}
          className="markdown-body"
          label="BD描述预览"
        >
          {text ? (
            <ReferenceContext.Provider value={{ references, tooltip }}>
              <Markdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                urlTransform={(url) =>
                  parseReference(url) ? url : defaultUrlTransform(url)
                }
                components={markdownComponents}
              >
                {text}
              </Markdown>
            </ReferenceContext.Provider>
          ) : (
            <p className="muted">尚未添加描述。</p>
          )}
        </MarkdownStyle>
      ) : (
        <>
          <div className="markdown-tools" aria-label="Markdown格式">
            {[
              { label: "粗体", before: "**", after: "**", sample: "重点内容" },
              { label: "标题", before: "\n## ", after: "\n", sample: "小标题" },
              { label: "列表", before: "\n- ", after: "\n", sample: "要点" },
            ].map((tool) => (
              <button
                key={tool.label}
                type="button"
                onClick={() => {
                  const start = input.current?.selectionStart || 0,
                    end = input.current?.selectionEnd || start;
                  insert(
                    tool.before +
                      (text.slice(start, end) || tool.sample) +
                      tool.after,
                    start,
                    end,
                  );
                }}
              >
                {tool.label}
              </button>
            ))}
            <MarkdownTableInsert
              capture={() => {
                tooltip.dismiss();
                setDismissed(true);
                return {
                  text,
                  position: input.current?.selectionEnd ?? text.length,
                };
              }}
              insert={(point, options) => {
                if (point.text !== text)
                  throw Error(
                    "正文在插入期间已变化，请重新打开表格窗口；原文已保留。",
                  );
                const next = insertMarkdownTable(text, point.position, options);
                change(next.value, next.start);
                setDismissed(true);
                requestAnimationFrame(() => {
                  input.current?.focus({ preventScroll: true });
                  input.current?.setSelectionRange(next.start, next.end);
                });
              }}
            />
            <button
              type="button"
              onClick={() => {
                const start = input.current?.selectionStart || 0;
                change(
                  text.slice(0, start) + " /" + text.slice(start),
                  start + 2,
                );
                requestAnimationFrame(() => {
                  input.current?.focus();
                  input.current?.setSelectionRange(start + 2, start + 2);
                });
              }}
            >
              引用资料 /
            </button>
          </div>
          <textarea
            ref={input}
            aria-label="BD描述Markdown"
            value={text}
            maxLength={60000}
            onChange={(event) =>
              change(event.target.value, event.target.selectionStart)
            }
            onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
            onKeyDown={keyDown}
            aria-controls={query ? `${id}-references` : undefined}
            aria-activedescendant={
              query && visible.length ? `${id}-reference-${active}` : undefined
            }
            placeholder="用 Markdown 说明玩法、循环和替代选择。输入 / 搜索技能、特性、食物、法印等资料。"
          />
          <small className="description-count">
            {text.length.toLocaleString()} / 60,000 ·
            支持标题、列表、表格、链接与代码块
          </small>
          {query && (
            <div className="reference-picker">
              <label>
                引用类型
                <select
                  aria-label="引用类型"
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value);
                    setSelected(0);
                  }}
                >
                  <option value="">全部资料</option>
                  {[
                    "技能",
                    "特性",
                    "食物",
                    "扳手",
                    "法印",
                    "符文",
                    "古物",
                    "宠物",
                    "灌注",
                    "物品",
                  ].map((label) => (
                    <option key={label}>{label}</option>
                  ))}
                </select>
              </label>
              <div
                role="listbox"
                aria-label="引用搜索结果"
                id={`${id}-references`}
              >
                {visible.map((reference, i) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    id={`${id}-reference-${i}`}
                    key={`${reference.kind}-${reference.entity.id}`}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => choose(reference)}
                  >
                    {reference.entity.icon && (
                      <img src={reference.entity.icon} alt="" loading="lazy" />
                    )}
                    <span>
                      {reference.entity.name}
                      <small>
                        {reference.category} · #{reference.entity.id}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
              <small>
                {matches.length
                  ? `找到 ${matches.length} 项${matches.length > 40 ? "，显示前 40 项，请继续输入缩小范围" : ""} · ↑↓ 选择，Enter 插入，Esc 关闭`
                  : "没有匹配资料，请修改 / 后的文字。"}
              </small>
            </div>
          )}
        </>
      )}
      {tooltip.content}
    </>
  );
  return (
    <section className="build-description" aria-label="BD 描述与讲解">
      <BuildProperties
        key={build.id}
        build={build}
        readonly={readonly}
        edit={edit}
      />
      {!enlarged && content}
      {!readonly && (
        <dialog
          ref={dialog}
          id={`${id}-expanded`}
          className="description-dialog"
          aria-label="放大编辑 BD 描述"
          onCancel={(event) => {
            event.preventDefault();
            if (query) setDismissed(true);
            else resizeEditor();
          }}
        >
          {enlarged && content}
        </dialog>
      )}
    </section>
  );
}
