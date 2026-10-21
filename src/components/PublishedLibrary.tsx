import { useEffect, useRef, useState, type CSSProperties } from "react";
import { readCollection, type PublishedCollection } from "../collection";
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
export function PublishedLibrary({
  close,
  open,
}: {
  close: () => void;
  open: (id: string) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [collection, setCollection] = useState<PublishedCollection | null>(
    null,
  );
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [profession, setProfession] = useState("");
  const [tag, setTag] = useState("");
  const [instance, setInstance] = useState("");
  const [boss, setBoss] = useState("");
  const [encounterMode, setEncounterMode] = useState("");
  const [mode, setMode] = useState<"encounter" | "profession">("encounter");
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  async function load() {
    setError("");
    try {
      const value = await readCollection();
      if (alive.current) setCollection(value);
    } catch {
      if (alive.current)
        setError("展示目录读取失败，请重试。你的本地配装仍保留。");
    }
  }
  useEffect(() => {
    dialog.current?.showModal();
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, []);
  const entries = collection?.builds || [];
  const matches = entries.filter((build) =>
    matchesBuild(build, {
      query,
      profession,
      tag,
      instance,
      boss,
      encounterMode,
    }),
  );
  const tags = sortedNames(entries.flatMap((build) => build.tags || []));
  const count = (id: string) =>
    entries.filter((build) => build.profession === id).length;
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
    setBusy(true);
    try {
      if (await open(id)) close();
      else if (alive.current)
        setError("未打开 BD。请检查读取状态，或保存当前修改后重试。");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="library published-library"
      aria-label="公开BD库"
      onCancel={close}
    >
      <header className="archive-header">
        <div className="archive-brand">
          <span className="archive-logo">
            <ArchiveMark />
          </span>
          <div>
            <span className="archive-eyebrow">P12 · BUILD ARCHIVE</span>
            <h2>公开 BD 库</h2>
          </div>
        </div>
        <div className="archive-header-actions">
          <span className="archive-edition">
            陆地 PvE
            <span />
            构筑收藏
          </span>
          <button aria-label="关闭公开BD库" onClick={close}>
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
              <small>{String(entries.length).padStart(2, "0")}</small>
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
                <small>{String(count(id)).padStart(2, "0")}</small>
              </button>
            ))}
          </nav>
          <div className="archive-sidebar-note">
            <span>每份构筑，都有自己的解法。</span>
            <p>
              从配装到讲解，
              <br />
              把你的战斗思路留在这里。
            </p>
            <div aria-hidden="true">— ✧ —</div>
          </div>
        </aside>
        <div className="archive-main">
          <section className="archive-intro" aria-label="构筑浏览介绍">
            <div>
              <p className="archive-eyebrow">EXPLORE THE BUILDS</p>
              <h3>
                为下一场战斗，
                <br className="archive-mobile-break" />
                找到合适的构筑。
              </h3>
              <p>按职业探索配装，或从副本与 BOSS 出发。</p>
            </div>
            <div className="archive-total">
              <strong>{String(entries.length).padStart(2, "0")}</strong>
              <span>份公开构筑</span>
            </div>
          </section>
          <div className="library-filters archive-filters">
            <label className="archive-search">
              <span className="sr-only">关键词搜索</span>
              <ArchiveMark search />
              <input
                type="search"
                aria-label="搜索公开BD名称"
                placeholder="搜索构筑名称、标签、副本或 BOSS…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <span className="archive-search-hint">搜索</span>
            </label>
            <label>
              职业
              <select
                aria-label="筛选公开BD职业"
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
                aria-label="筛选公开BD标签"
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
              prefix="公开BD"
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
          {error && (
            <div role="alert" className="archive-error">
              <span>{error}</span>
              <button onClick={() => void load()}>重试展示目录</button>
            </div>
          )}
          {!collection && !error && (
            <div className="archive-loading" role="status">
              <ArchiveMark />
              <p>正在读取展示目录…</p>
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
                      </span>
                      <span className="archive-card-footer">
                        <span>查看构筑与讲解</span>
                        <span aria-hidden="true">↗</span>
                      </span>
                    </button>
                  </div>
                );
              }}
            </BuildGroups>
            {collection && !matches.length && (
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
                    : "公开库，等待你的第一份构筑。"}
                </h3>
                <p>
                  {entries.length
                    ? "换一组职业、标签或副本条件，继续探索。"
                    : "发布后的构筑将在这里汇集，配装与思路，一起被看见。"}
                </p>
                {!entries.length && (
                  <small>本机保存的配装，可在「我的配装」中查看。</small>
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
