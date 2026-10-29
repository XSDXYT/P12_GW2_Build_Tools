import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ZodError } from "zod";
import {
  builtinMarkdownStyles,
  compileMarkdownStyle,
  descriptionStyleSchema,
  type DescriptionStyle,
  classicDescriptionStyle,
} from "../markdown-style";
import {
  downloadStyle,
  downloadCssDefaults,
  readCssDefaults,
  readStyleDirectory,
  readStyleFile,
  removeStyleFile,
  writeStyleFile,
  type StyleDirectory,
  type StyleFile,
} from "../markdown-style-files";
import { MarkdownStyle } from "./MarkdownStyle";
type Entry = DescriptionStyle & { id: string; disk?: StyleFile };
export type MarkdownStyleSession = {
  name: string;
  css: string;
  entries: Entry[];
  selected: string;
  directory: StyleDirectory | null;
  applied: string;
};
const starter =
  ".md-content {\n  color: #e4eef0;\n  background: #182c36;\n  padding: 24px;\n  font-size: 17px;\n  line-height: 1.95;\n}\nh2 { color: #e0c58e; }\nblockquote { border-left: 3px solid #90b7bd; padding-left: 16px; }\n";
const errorText = (e: unknown) =>
  e instanceof Error
    ? e instanceof ZodError
      ? e.issues[0]?.message || "CSS格式或名称不符合要求。"
      : e.message
    : "操作失败，请重试；当前BD和模板保留。";

export function MarkdownStylePicker({
  value,
  onChange,
  session,
  readonlyView = false,
  defaultStyle,
  setDefault,
  restoreAuthor,
}: {
  value?: DescriptionStyle;
  onChange: (style?: DescriptionStyle) => void;
  session: RefObject<MarkdownStyleSession | null>;
  readonlyView?: boolean;
  defaultStyle?: DescriptionStyle;
  setDefault: (style?: DescriptionStyle) => string;
  restoreAuthor?: () => void;
}) {
  const initial = session.current;
  const signature = JSON.stringify(value ?? null);
  const retainDraft = initial?.applied === signature;
  const previousValue = useRef(signature);
  const [name, setName] = useState(
      retainDraft ? initial.name : value?.name || "我的模板",
    ),
    [css, setCss] = useState(retainDraft ? initial.css : value?.css || starter);
  const [entries, setEntries] = useState<Entry[]>(initial?.entries || []),
    [selected, setSelected] = useState(initial?.selected || "");
  const [directory, setDirectory] = useState<StyleDirectory | null>(
    initial?.directory || null,
  );
  session.current = {
    name,
    css,
    entries,
    selected,
    directory,
    applied: signature,
  };
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [deleteEntry, setDeleteEntry] = useState<Entry | null>(null);
  const input = useRef<HTMLInputElement>(null),
    alive = useRef(true),
    pending = useRef(false);
  const defaultsInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (previousValue.current === signature) return;
    previousValue.current = signature;
    setName(value?.name || "我的模板");
    setCss(value?.css || starter);
  }, [signature, value?.name, value?.css]);
  const validation = useMemo(() => {
    try {
      compileMarkdownStyle(css);
      return "";
    } catch (e) {
      return errorText(e);
    }
  }, [css]);
  const preview = !validation ? { name: name || "预览", css } : undefined;
  const current = entries.find((entry) => entry.id === selected);
  const activeName = value?.name || "经典样式";
  function apply(style?: DescriptionStyle) {
    onChange(style ? { name: style.name, css: style.css } : undefined);
    setDeleteEntry(null);
    setMessage(
      style
        ? readonlyView
          ? `已应用“${style.name}”，用于本次查看和截图；原BD保持不变。`
          : `已应用“${style.name}”，保存BD时会一起保存。`
        : "已恢复经典样式。",
    );
    setError("");
  }
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      if (
        alive.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(errorText(e));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function chooseBuiltin(
    template: (typeof builtinMarkdownStyles)[number],
  ) {
    await run(async () => {
      controller.current?.abort();
      const job = new AbortController();
      controller.current = job;
      const timeout = setTimeout(
        () => job.abort(Error("读取模板超时，请重试或导入CSS。")),
        8000,
      );
      let content: string;
      try {
        const response = await fetch(`./markdown-styles/${template.file}`, {
          signal: job.signal,
          cache: "no-store",
        });
        if (!response.ok) throw Error("内置模板暂不可用，请重试或导入CSS。");
        content = await response.text();
      } finally {
        clearTimeout(timeout);
      }
      const style = descriptionStyleSchema.parse({
        name: template.name,
        css: content,
      });
      if (alive.current) {
        setSelected("");
        apply(style);
      }
    });
  }
  async function connect() {
    if (!window.showDirectoryPicker) {
      setError("此浏览器不支持连接文件夹，请使用“导入CSS”和“下载CSS”。");
      return;
    }
    await run(async () => {
      const chosen = (await window.showDirectoryPicker!({
        id: "p12-markdown-styles",
        mode: "readwrite",
      })) as StyleDirectory;
      const loaded = await readStyleDirectory(chosen);
      if (!alive.current) return;
      setDirectory(chosen);
      setSelected("");
      setDeleteEntry(null);
      setEntries((old) => [
        ...old.filter((e) => !e.disk),
        ...loaded.files.map((file) => ({
          ...file,
          id: `file:${file.file}`,
          disk: file,
        })),
      ]);
      setMessage(
        `已连接“${chosen.name}”：${loaded.files.length}个模板${loaded.skipped.length ? `，跳过${loaded.skipped.length}个无效文件` : ""}。`,
      );
    });
  }
  async function refresh() {
    if (!directory) return;
    await run(async () => {
      const loaded = await readStyleDirectory(directory);
      if (!alive.current) return;
      setEntries((old) => [
        ...old.filter((e) => !e.disk),
        ...loaded.files.map((file) => ({
          ...file,
          id: `file:${file.file}`,
          disk: file,
        })),
      ]);
      setSelected("");
      setDeleteEntry(null);
      setMessage(
        `已刷新：${loaded.files.length}个模板${loaded.skipped.length ? `，跳过${loaded.skipped.length}个无效文件` : ""}。当前BD样式保持原样，选用模板后再更新。`,
      );
    });
  }
  async function importFile(file?: File) {
    if (!file) return;
    await run(async () => {
      const style = await readStyleFile(file);
      if (!alive.current) return;
      if (entries.filter((e) => !e.disk).length >= 50)
        throw Error("本次最多导入50个模板，请先移除一些模板。");
      const entry = {
        ...style,
        id: `import:${crypto.randomUUID()}`,
        disk: undefined,
      };
      setEntries((old) => [...old, entry]);
      setSelected(entry.id);
      apply(style);
    });
  }
  function applyDraft() {
    try {
      const style = descriptionStyleSchema.parse({ name, css });
      apply(style);
    } catch (e) {
      setError(validation || errorText(e));
    }
  }
  async function saveFile(overwrite: boolean) {
    if (!directory || validation) return;
    const oldFile = overwrite ? current?.disk : undefined;
    await run(async () => {
      const saved = await writeStyleFile(directory, { name, css }, oldFile);
      if (!alive.current) return;
      const entry = { ...saved, id: `file:${saved.file}`, disk: saved };
      setEntries((old) => [...old.filter((e) => e.id !== entry.id), entry]);
      setSelected(entry.id);
      setMessage(
        `已${oldFile ? "更新" : "保存"}“${saved.file}”。${readonlyView ? "要用于当前查看和截图，请点击“应用CSS”。" : "需要同步本BD时，请另点“应用CSS”。"}`,
      );
    });
  }
  async function confirmDelete() {
    if (!deleteEntry) return;
    const target = deleteEntry;
    await run(async () => {
      if (target.disk) {
        if (!directory) return;
        await removeStyleFile(directory, target.disk);
      }
      if (!alive.current) return;
      setEntries((old) => old.filter((e) => e.id !== target.id));
      setSelected("");
      setDeleteEntry(null);
      setMessage(
        target.disk
          ? readonlyView
            ? "CSS文件已删除；本次外观仍保留，原BD保持不变。"
            : "CSS文件已删除；当前BD内的样式副本仍保留。"
          : "模板已从本次列表移除，原CSS文件和当前BD保持原样。",
      );
    });
  }
  return (
    <div className="md-style-picker" aria-label="CSS 样式">
      <div className="md-style-heading">
        <span>CSS 样式</span>
        <small>当前：{activeName}</small>
      </div>
      <div className="md-style-cards">
        <button
          type="button"
          disabled={busy}
          aria-pressed={!value || value.css === classicDescriptionStyle.css}
          onClick={() => {
            setSelected("");
            apply();
          }}
        >
          <span className="md-style-swatch md-style-classic" aria-hidden="true">
            Aa
          </span>
          <strong>经典样式</strong>
          <small>沿用现有排版</small>
        </button>
        {builtinMarkdownStyles.map((template) => (
          <button
            type="button"
            key={template.file}
            disabled={busy}
            aria-pressed={value?.name === template.name}
            onClick={() => void chooseBuiltin(template)}
          >
            <span
              className="md-style-swatch"
              style={{ background: template.background, color: template.color }}
              aria-hidden="true"
            >
              Aa
            </span>
            <strong>{template.name}</strong>
            <small>{template.summary}</small>
          </button>
        ))}
      </div>
      <div className="md-style-toolbar">
        <span className="md-style-help">
          默认：{defaultStyle?.name || "经典样式"}
        </span>
        <button
          type="button"
          disabled={
            busy ||
            (value?.css || classicDescriptionStyle.css) ===
              (defaultStyle?.css || classicDescriptionStyle.css)
          }
          onClick={() => {
            try {
              setMessage(setDefault(value));
              setError("");
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          设为默认样式
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            try {
              downloadCssDefaults(defaultStyle);
              setMessage("已发起默认CSS设置下载，下次可导入恢复。文件不含BD。");
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          导出默认设置
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => defaultsInput.current?.click()}
        >
          导入默认设置
        </button>
        <input
          hidden
          ref={defaultsInput}
          type="file"
          accept=".json,application/json"
          aria-label="导入默认CSS设置"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file)
              void run(async () => {
                const style = await readCssDefaults(file);
                if (alive.current) setMessage(setDefault(style));
              });
          }}
        />
        {restoreAuthor && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              restoreAuthor();
              setMessage("已恢复BD自带样式；未指定时使用默认样式。");
            }}
          >
            恢复BD原样式
          </button>
        )}
      </div>
      {readonlyView && (
        <p className="md-style-help">
          只读查看：切换或加载CSS会同步用于截图，不改动公开BD、下载JSON或原分享链接。
        </p>
      )}
      <details className="md-style-workshop">
        <summary>管理与自定义 CSS</summary>
        <p className="md-style-help">
          内置文件位于
          public/markdown-styles/。可下载后修改，也可连接自己的模板文件夹。模板列表仅在本次页面有效；
          {readonlyView
            ? "本次查看的样式用于截图，原BD保持不变。"
            : "已应用样式随BD保存、分享和截图。"}
        </p>
        <div className="md-style-toolbar">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            导入CSS
          </button>
          <input
            hidden
            ref={input}
            type="file"
            accept=".css,text/css"
            aria-label="导入CSS文件"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void importFile(file);
            }}
          />
          <button type="button" disabled={busy} onClick={() => void connect()}>
            {directory ? "更换模板文件夹" : "连接模板文件夹"}
          </button>
          {directory && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void refresh()}
              >
                刷新模板
              </button>
              <span>{directory.name}</span>
            </>
          )}
        </div>
        {!!entries.length && (
          <div className="md-style-custom-row">
            <label>
              自定义模板
              <select
                aria-label="自定义模板"
                value={selected}
                disabled={busy}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setDeleteEntry(null);
                  const entry = entries.find(
                    (item) => item.id === e.target.value,
                  );
                  if (entry) {
                    setName(entry.name);
                    setCss(entry.css);
                    setMessage(
                      readonlyView
                        ? "已载入CSS编辑区，点击“应用CSS”用于本次查看和截图。"
                        : "已载入CSS编辑区，点击“应用CSS”更新本BD。",
                    );
                  }
                }}
              >
                <option value="">选择一个模板</option>
                {entries.map((entry) => (
                  <option value={entry.id} key={entry.id}>
                    {entry.disk ? "文件夹" : "已导入"} · {entry.name}
                  </option>
                ))}
              </select>
            </label>
            {current && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleteEntry(current)}
              >
                {current.disk ? "删除CSS文件" : "移除模板"}
              </button>
            )}
          </div>
        )}
        {deleteEntry && (
          <div
            className="md-style-delete"
            role="group"
            aria-label="确认删除模板"
          >
            <p>
              {deleteEntry.disk
                ? `删除文件“${deleteEntry.disk.file}”？此操作会删除磁盘文件，已有BD中的样式副本保留。`
                : `移除“${deleteEntry.name}”？原CSS文件不变。`}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              确认删除
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDeleteEntry(null)}
            >
              取消删除
            </button>
          </div>
        )}
        <div className="md-style-editor-grid">
          <div className="md-style-source">
            <label>
              模板名称
              <input
                aria-label="CSS模板名称"
                value={name}
                maxLength={60}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              CSS源代码
              <textarea
                aria-label="CSS源代码"
                value={css}
                maxLength={20000}
                disabled={busy}
                spellCheck={false}
                onChange={(e) => setCss(e.target.value)}
              />
            </label>
            <small>
              {css.length.toLocaleString()} / 20,000 · 用 .md-content
              表示正文，h2、blockquote、table 等选择器自动限定在正文内。
            </small>
            {validation && (
              <p className="md-style-error" role="alert">
                {validation}
              </p>
            )}
            <div className="md-style-toolbar">
              <button
                type="button"
                className="primary"
                disabled={busy || !!validation || !name.trim()}
                onClick={applyDraft}
              >
                应用CSS
              </button>
              <button
                type="button"
                disabled={busy || !!validation || !name.trim()}
                onClick={() => {
                  try {
                    downloadStyle({ name, css });
                    setMessage("已发起CSS下载，可放入自己的模板文件夹。");
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                下载CSS
              </button>
              {directory && (
                <>
                  <button
                    type="button"
                    disabled={busy || !!validation || !name.trim()}
                    onClick={() => void saveFile(false)}
                  >
                    另存到模板文件夹
                  </button>
                  {current?.disk && (
                    <button
                      type="button"
                      disabled={busy || !!validation || !name.trim()}
                      onClick={() => void saveFile(true)}
                    >
                      更新原CSS文件
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="md-style-sample">
            <small>样式预览 · 示例内容</small>
            <MarkdownStyle
              style={preview}
              className="markdown-body"
              label="CSS样式示例"
            >
              <h2>开场与技能衔接</h2>
              <p>
                先保证<strong>关键增益覆盖</strong>，再进入输出循环。配合{" "}
                <span className="build-reference">幻象回复</span> 恢复队友。
              </p>
              <blockquote>保留一个解控技能，应对BOSS的下一次机制。</blockquote>
              <table>
                <thead>
                  <tr>
                    <th>阶段</th>
                    <th>要点</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>开场</td>
                    <td>提前准备增益</td>
                  </tr>
                  <tr>
                    <td>转阶段</td>
                    <td>保留机动技能</td>
                  </tr>
                </tbody>
              </table>
              <p>
                技能顺序：<code>治疗 → 增益 → 武器切换</code>
              </p>
            </MarkdownStyle>
          </div>
        </div>
      </details>
      <div aria-live="polite" className="md-style-feedback">
        {busy ? "正在处理模板…" : message}
      </div>
      {error && (
        <p className="md-style-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
