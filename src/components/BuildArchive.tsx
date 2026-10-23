import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { BrowseBuild } from "../build-classification";
import { accents, professions } from "../editor";
import { matchesBuild, sortedNames } from "../build-classification";
import { encounterModeNames } from "../encounter-modes";
import { BuildGroups, EncounterFilters, GroupMode } from "./BuildBrowse";

function ArchiveMark({ search = false }: { search?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {search ? (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 5 5" />
        </>
      ) : (
        <>
          <path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" />
          <path d="m3 7 9 5 9-5M12 12v10M7 4.8l10 5.6" />
        </>
      )}
    </svg>
  );
}
export function BuildArchive({
  source,
  entries,
  ready,
  loading = false,
  error = "",
  description,
  actions,
  filename,
  close,
  open,
  reload,
}: {
  source: "published" | "local";
  entries: BrowseBuild[];
  ready: boolean;
  loading?: boolean;
  error?: string;
  description?: string;
  actions?: ReactNode;
  filename?: (id: string) => string | undefined;
  close: () => void;
  open: (id: string) => Promise<boolean>;
  reload: () => void;
}) {
  const local = source === "local";
  const prefix = local ? "本地BD" : "公开BD";
  const dialog = useRef<HTMLDialogElement>(null);
  const [openError, setOpenError] = useState("");
  const [query, setQuery] = useState("");
  const [profession, setProfession] = useState("");
  const [tag, setTag] = useState("");
  const [instance, setInstance] = useState("");
  const [boss, setBoss] = useState("");
  const [encounterMode, setEncounterMode] = useState("");
  const [mode, setMode] = useState<"encounter" | "profession">("encounter");
  const [opening, setOpening] = useState(false);
  const alive = useRef(true);
  const busy = opening || loading;
  useEffect(() => {
    setOpenError("");
  }, [entries, error]);
  useLayoutEffect(() => {
    alive.current = true;
    const modal = dialog.current;
    const root = document.documentElement;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = root.style.overflow;
    const gutter = root.style.scrollbarGutter;
    // Keep the workbench stationary while the archive's own scroller moves.
    root.style.scrollbarGutter = "stable";
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    modal?.showModal();
    return () => {
      alive.current = false;
      modal?.close();
      document.body.style.overflow = bodyOverflow;
      root.style.overflow = rootOverflow;
      root.style.scrollbarGutter = gutter;
    };
  }, []);
  const matches = useMemo(
    () =>
      entries.filter((build) =>
        matchesBuild(build, {
          query,
          profession,
          tag,
          instance,
          boss,
          encounterMode,
        }),
      ),
    [entries, query, profession, tag, instance, boss, encounterMode],
  );
  const tags = useMemo(
    () => sortedNames(entries.flatMap((build) => build.tags || [])),
    [entries],
  );
  const counts = useMemo(() => {
    const values = new Map<string, number>();
    for (const build of entries)
      values.set(build.profession, (values.get(build.profession) || 0) + 1);
    return values;
  }, [entries]);
  const hasFilter = !!(
    query ||
    profession ||
    tag ||
    instance ||
    boss ||
    encounterMode
  );
  function clearFilters() {
    setQuery("");
    setProfession("");
    setTag("");
    setInstance("");
    setBoss("");
    setEncounterMode("");
  }
  async function openBuild(id: string) {
    if (busy) return;
    setOpening(true);
    setOpenError("");
    try {
      if (await open(id)) {
        if (alive.current) close();
      } else if (alive.current)
        setOpenError("未载入 BD，当前草稿保留。可下载当前修改后重试。");
    } catch {
      if (alive.current)
        setOpenError(
          local
            ? "文件读取失败或内容已变化，当前草稿保留。请刷新文件夹后重试。"
            : "公开 BD 读取失败，当前草稿保留。请重试。",
        );
    } finally {
      if (alive.current) setOpening(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="library published-library"
      aria-label={prefix + "库"}
      onCancel={close}
    >
      <header className="archive-header">
        <div className="archive-brand">
          <span className="archive-logo">
            <ArchiveMark />
          </span>
          <div>
            <h2>{local ? "本地 BD 库" : "公开 BD 库"}</h2>
          </div>
        </div>
        <div className="archive-header-actions">
          <span className="archive-edition">
            陆地 PvE
            <span />
            {local ? "文件夹配装" : "构筑收藏"}
          </span>
          <button aria-label={"关闭" + prefix + "库"} onClick={close}>
            ×
          </button>
        </div>
      </header>
      <div className="archive-layout">
        <aside className="archive-sidebar">
          <p className="archive-nav-label">按职业探索</p>
          <nav aria-label="职业快捷筛选">
            <button
              className="archive-nav-all"
              aria-pressed={!profession}
              onClick={() => setProfession("")}
            >
              <span className="archive-nav-symbol">✦</span>
              <span>全部职业</span>
              <small>{entries.length}</small>
            </button>
            {Object.entries(professions).map(([id, name]) => (
              <button
                key={id}
                style={{ "--profession-accent": accents[id] } as CSSProperties}
                aria-pressed={profession === id}
                onClick={() => setProfession(id)}
              >
                <span className="archive-nav-symbol">{name.slice(0, 1)}</span>
                <span>{name}</span>
                <small>{counts.get(id) || 0}</small>
              </button>
            ))}
          </nav>
          <div className="archive-sidebar-note">
            <span>浏览提示</span>
            <p>选择职业，再用副本与 BOSS 缩小查找范围。</p>
          </div>
        </aside>
        <div className="archive-main">
          <section className="archive-intro" aria-label="构筑浏览介绍">
            <div>
              <h3>{local ? "浏览文件夹中的 BD" : "找到适合这场战斗的 BD"}</h3>
              <p>
                {description || "按职业、副本与 BOSS 筛选，查看配装与讲解。"}
              </p>
            </div>
          </section>
          {actions && <div className="archive-folder-actions">{actions}</div>}
          <div className="library-filters archive-filters">
            <label className="archive-search">
              <span className="sr-only">关键词搜索</span>
              <ArchiveMark search />
              <input
                type="search"
                aria-label={"搜索" + prefix + "名称"}
                placeholder="搜索构筑名称、标签、副本或 BOSS…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <span className="archive-search-hint">搜索</span>
            </label>
            <label>
              职业
              <select
                aria-label={"筛选" + prefix + "职业"}
                value={profession}
                onChange={(event) => setProfession(event.target.value)}
              >
                <option value="">全部职业</option>
                {Object.entries(professions).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              构筑标签
              <select
                aria-label={"筛选" + prefix + "标签"}
                value={tag}
                onChange={(event) => setTag(event.target.value)}
              >
                <option value="">全部标签</option>
                {tags.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <EncounterFilters
              entries={entries}
              instance={instance}
              boss={boss}
              mode={encounterMode}
              changeMode={setEncounterMode}
              prefix={prefix}
              change={(next, target) => {
                setInstance(next);
                setBoss(target);
              }}
            />
          </div>
          <div className="archive-results-toolbar">
            <div>
              <p className="library-count" aria-live="polite">
                显示 <strong>{matches.length}</strong> / {entries.length} 个 BD
              </p>
              {mode === "encounter" && (
                <span className="archive-count-note">
                  同一 BD 可归入多个 BOSS
                </span>
              )}
            </div>
            <div className="archive-results-actions">
              <button
                className="archive-clear"
                disabled={!hasFilter}
                onClick={clearFilters}
              >
                清除筛选
              </button>
              <GroupMode value={mode} change={setMode} />
            </div>
          </div>
          {(error || openError) && (
            <div role="alert" className="archive-error">
              <span>{error || openError}</span>
              <button
                disabled={busy}
                onClick={() => {
                  setOpenError("");
                  reload();
                }}
              >
                {local ? "重新读取文件夹" : "重试展示目录"}
              </button>
            </div>
          )}
          {((!ready && !error) || loading) && (
            <div className="archive-loading" role="status">
              <ArchiveMark />
              <p>{local ? "正在读取本地文件夹…" : "正在读取展示目录…"}</p>
            </div>
          )}
          <div className="library-list archive-results" aria-busy={busy}>
            <BuildGroups
              entries={matches}
              mode={mode}
              filter={{ instance, boss, encounterMode }}
            >
              {(build) => {
                const label = Object.hasOwn(professions, build.profession)
                  ? professions[build.profession]
                  : build.profession;
                const accent = Object.hasOwn(accents, build.profession)
                  ? accents[build.profession]
                  : "#d4b885";
                const scenes = build.encounters || [];
                return (
                  <div
                    className="library-row archive-card"
                    key={build.id}
                    style={{ "--profession-accent": accent } as CSSProperties}
                  >
                    <button
                      className="library-open"
                      disabled={busy}
                      onClick={() => void openBuild(build.id)}
                    >
                      <span className="archive-card-top">
                        <span
                          className="archive-profession-glyph"
                          aria-hidden="true"
                        >
                          {label.slice(0, 1)}
                        </span>
                        <span>{label}</span>
                        <span className="archive-card-type">陆地 PvE</span>
                      </span>
                      <strong className="archive-card-title">
                        {build.name}
                      </strong>
                      <span className="archive-card-tags">
                        {build.tags?.length ? (
                          build.tags.map((value) => (
                            <span key={value}>{value}</span>
                          ))
                        ) : (
                          <small>未添加构筑标签</small>
                        )}
                      </span>
                      <span className="archive-card-context">
                        <span className="archive-card-context-label">
                          适用场景
                        </span>
                        {scenes.length ? (
                          scenes.slice(0, 2).map((scene, index) => (
                            <span key={index}>
                              {scene.instance} / {scene.boss || "副本通用"}
                              {scene.mode &&
                                ` · ${encounterModeNames[scene.mode]}`}
                            </span>
                          ))
                        ) : (
                          <span>未指定适用副本</span>
                        )}
                        {scenes.length > 2 && (
                          <span>另有 {scenes.length - 2} 个适用场景</span>
                        )}
                        {filename?.(build.id) && (
                          <span className="archive-file-name">
                            文件：{filename(build.id)}
                          </span>
                        )}
                      </span>
                      <span className="archive-card-footer">
                        <span>
                          {local ? "载入配装与讲解" : "查看构筑与讲解"}
                        </span>
                        <span aria-hidden="true">↗</span>
                      </span>
                    </button>
                  </div>
                );
              }}
            </BuildGroups>
            {ready && !loading && !matches.length && (
              <div className="empty-library archive-empty">
                <div className="archive-empty-art" aria-hidden="true">
                  <ArchiveMark />
                </div>
                <p className="archive-eyebrow">
                  {entries.length
                    ? "NO MATCHES FOUND"
                    : "YOUR NEXT BUILD STARTS HERE"}
                </p>
                <h3>
                  {entries.length
                    ? "没有找到匹配的构筑"
                    : local
                      ? "文件夹中还没有可用的 BD"
                      : "公开库，等待你的第一份构筑。"}
                </h3>
                <p>
                  {entries.length
                    ? "换一组职业、标签或副本条件，继续探索。"
                    : local
                      ? "将 BD JSON 文件放入此文件夹，再点击刷新文件夹。"
                      : "发布后的构筑将在这里汇集，配装与思路，一起被看见。"}
                </p>
                {!entries.length && (
                  <small>
                    {local
                      ? "支持版本 1 的单 BD JSON，读取当前文件夹，不含子文件夹。"
                      : "已有本地 BD 可通过「导入 JSON」或连接 BD 文件夹载入。"}
                  </small>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <footer className="archive-footer">
        <span>配装 · 特性 · 技能 · 构筑讲解</span>
        <button onClick={close}>
          返回工作台 <span aria-hidden="true">↗</span>
        </button>
      </footer>
    </dialog>
  );
}
