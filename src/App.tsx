import { useState, useEffect, useRef, type CSSProperties } from "react";
import { createBuild, issues, type Catalog, type Build } from "./domain";
import { accents, professions, type PickerRequest } from "./editor";
import { useWorkspace } from "./hooks/useWorkspace";
import { GearPanel } from "./components/GearPanel";
import { TraitsPanel } from "./components/TraitsPanel";
import { BuildDescription } from "./components/BuildDescription";
import { Picker } from "./components/Picker";
import { BuildLibrary } from "./components/BuildLibrary";
import { AttributePreviewProvider } from "./hooks/useAttributePreview";
import { appVersion, releaseCommit } from "./release";
import { BuildFolder } from "./components/BuildFolder";
import { PublishedLibrary } from "./components/PublishedLibrary";
export function App() {
  const work = useWorkspace();
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [loading, setLoading] = useState(true),
    [picker, setPicker] = useState<(PickerRequest & { token: string }) | null>(
      null,
    ),
    [libraryOpen, setLibraryOpen] = useState(false),
    [publishedOpen, setPublishedOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  async function load() {
    setLoading(true);
    try {
      const response = await fetch("./catalog.json", { cache: "no-store" });
      if (!response.ok) throw Error();
      const data = await response.json();
      if (!Array.isArray(data.professions) || !data.revision) throw Error();
      setCatalog(data);
    } catch {
      work.setMessage("游戏资料加载失败。请重试，当前配装仍保留。");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const errors = catalog ? issues(work.build, catalog) : [];
  const props = catalog
    ? {
        build: work.build,
        catalog,
        readonly: work.readonly,
        edit: work.edit,
        pick: (request: PickerRequest) =>
          setPicker({ ...request, token: crypto.randomUUID() }),
        notify: work.setMessage,
      }
    : null;
  const spec = catalog?.specs.find(
    (spec) => spec.elite && work.build.specs.some((s) => s.id === spec.id),
  );
  return (
    <div
      className="app-shell"
      style={
        { "--class-accent": accents[work.build.profession] } as CSSProperties
      }
    >
      <header className="masthead">
        <a
          className="brand"
          href="#"
          onClick={(event) => event.preventDefault()}
        >
          <span className="brandmark">P12</span>
          <span>
            激战 2 <strong>配装工坊</strong>
          </span>
        </a>
        <span className="workspace-label">BUILD WORKSPACE</span>
        <span className="header-mode">
          陆地 PvE <span className="dot" /> v{appVersion}
        </span>
      </header>
      <main>
        <div className="workspace-toolbar">
          <div className="build-identity">
            <span className="profession-marker" aria-hidden="true">
              {professions[work.build.profession].slice(0, 1)}
            </span>
            <div>
              <label className="sr-only" htmlFor="build-name">
                配装名称
              </label>
              <input
                id="build-name"
                aria-label="配装名称"
                className="build-name"
                maxLength={80}
                readOnly={work.readonly}
                value={work.build.name}
                onChange={(event) =>
                  work.edit((b) => {
                    b.name = event.target.value;
                  })
                }
              />
              <span className="build-caption">
                {professions[work.build.profession]}
                {spec ? " / " + spec.name : " / 核心职业"}
                <span className="status-bullet">·</span>
                {work.readonly
                  ? "分享快照"
                  : work.dirty
                    ? "尚未保存"
                    : "已就绪"}
              </span>
            </div>
          </div>
          <div className="toolbar-actions">
            <button onClick={() => setLibraryOpen(true)}>
              我的配装 <span className="count">{work.library.length}</span>
            </button>
            <button onClick={() => setPublishedOpen(true)}>公开 BD 库</button>
            <button onClick={work.newBuild}>新建</button>
            {work.readonly ? (
              <button onClick={work.copy}>复制编辑</button>
            ) : (
              <button onClick={work.save}>
                {work.dirty ? "保存修改" : "保存"}
              </button>
            )}
            <button
              className="primary"
              onClick={() => catalog && void work.share(catalog)}
              disabled={!catalog}
            >
              分享配装 ↗
            </button>
          </div>
        </div>
        <BuildFolder
          build={work.build}
          catalog={catalog}
          notify={work.setMessage}
          open={work.replace}
          saved={work.markFileSaved}
        />
        <div className="context-bar">
          <label>
            职业
            <select
              aria-label="职业"
              value={work.build.profession}
              disabled={work.readonly || !catalog}
              onChange={(event) => {
                if (
                  !confirm(
                    "切换职业将清空技能、特性与武器配置，保留其他装备。继续吗？",
                  )
                )
                  return;
                const profession = event.target.value as Build["profession"];
                work.edit((b) => {
                  const fresh = createBuild(profession);
                  b.profession = profession;
                  b.skills = fresh.skills;
                  b.specs = fresh.specs;
                  for (const key of [
                    "weapon1",
                    "offhand1",
                    "weapon2",
                    "offhand2",
                  ] as const)
                    b.equipment[key] = fresh.equipment[key];
                });
              }}
            >
              {Object.entries(professions).map(([id, name]) => (
                <option value={id} key={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <span className="context-hint">
            {work.readonly
              ? "只读查看 · 复制后可自由编辑"
              : "点击文字或图标配置 · 自动检查选择冲突"}
          </span>
          {work.undo && (
            <button className="undo-button" onClick={work.undoEdit}>
              撤销{work.undo.label} ↶
            </button>
          )}
          <span className="data-status">
            {catalog
              ? "资料 " + new Date(catalog.revision).toLocaleDateString("zh-CN")
              : "正在准备资料"}
          </span>
        </div>
        {work.message && (
          <div className="notice" role="status">
            <span>{work.message}</span>
            <button aria-label="关闭提示" onClick={() => work.setMessage("")}>
              ×
            </button>
          </div>
        )}
        {errors.length > 0 && (
          <details className="validation">
            <summary>{errors.length} 项配置需要检查</summary>
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </details>
        )}
        {work.shareLink && (
          <div className="share">
            <label>
              分享链接 · 任何持有链接的人均可查看
              <input
                readOnly
                value={work.shareLink}
                onFocus={(event) => event.target.select()}
              />
            </label>
          </div>
        )}
        {props ? (
          <AttributePreviewProvider build={props.build} catalog={props.catalog}>
            <div className="workspace-layout">
              <GearPanel {...props} />
              <TraitsPanel {...props} />
            </div>
            <BuildDescription key={props.build.id} {...props} />
          </AttributePreviewProvider>
        ) : (
          <div className="loading">
            <h2>{loading ? "正在准备游戏资料…" : "暂时无法加载资料"}</h2>
            <p>当前配装记录仍保留。</p>
            {!loading && <button onClick={() => void load()}>重新加载</button>}
          </div>
        )}
        <footer>
          <span>P12 · GW2 BUILD TOOLS</span>
          <span
            title={
              releaseCommit === "local"
                ? "本地开发版本"
                : `发布提交 ${releaseCommit}`
            }
          >
            v{appVersion}
            {releaseCommit !== "local" && ` · ${releaseCommit.slice(0, 7)}`}
          </span>
          <p>80 级升华槽位 · 含属性预览，职业专属机制仍在完善</p>
          <div>
            {work.readonly && (
              <button onClick={work.cacheBuild}>存到浏览器</button>
            )}
            <button onClick={work.exportFile}>导出 JSON</button>
            <button onClick={() => file.current?.click()}>导入 JSON</button>
          </div>
        </footer>
        <input
          hidden
          type="file"
          ref={file}
          accept=".json,application/json"
          onChange={(event) => {
            void work.importFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </main>
      {picker && (
        <Picker
          key={picker.token}
          request={picker}
          readonly={work.readonly}
          onClose={() =>
            setPicker((current) =>
              current?.token === picker.token ? null : current,
            )
          }
        />
      )}
      {libraryOpen && (
        <BuildLibrary
          entries={work.library}
          metadata={work.metadata}
          onMetadata={work.updateMetadata}
          onBackup={work.exportLibrary}
          onClose={() => setLibraryOpen(false)}
          onOpen={(b) => {
            if (work.replace(b)) setLibraryOpen(false);
          }}
          onRemove={work.remove}
          onCopy={(b) => {
            if (
              work.replace(
                {
                  ...b,
                  id: crypto.randomUUID(),
                  name: (b.name + " · 副本").slice(0, 80),
                },
                true,
              )
            )
              setLibraryOpen(false);
          }}
          onImport={() => {
            setLibraryOpen(false);
            file.current?.click();
          }}
        />
      )}
      {publishedOpen && (
        <PublishedLibrary
          close={() => setPublishedOpen(false)}
          open={work.openPublished}
        />
      )}
    </div>
  );
}
