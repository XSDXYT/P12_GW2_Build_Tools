import { useState, useEffect, useRef, type CSSProperties } from "react";
import { createBuild, issues, type Catalog, type Build } from "./domain";
import { accents, professions, type PickerRequest } from "./editor";
import { useWorkspace } from "./hooks/useWorkspace";
import { GearPanel } from "./components/GearPanel";
import { TraitsPanel } from "./components/TraitsPanel";
import { BuildDescription } from "./components/BuildDescription";
import { Picker } from "./components/Picker";
import { BuildRecovery } from "./components/BuildRecovery";
import { AttributePreviewProvider } from "./hooks/useAttributePreview";
import { appVersion, releaseCommit } from "./release";
import { BuildFolder } from "./components/BuildFolder";
import { PublishedLibrary } from "./components/PublishedLibrary";
import { mergeSkillCatalog } from "./weapon-skills";
import { mergeMechanicCatalog } from "./profession-mechanics";
export function App() {
  const work = useWorkspace();
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [loading, setLoading] = useState(true),
    [picker, setPicker] = useState<(PickerRequest & { token: string }) | null>(
      null,
    ),
    [publishedOpen, setPublishedOpen] = useState(false);
  const [weaponError, setWeaponError] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  async function load() {
    setLoading(true);
    setWeaponError(false);
    try {
      const response = await fetch("./catalog.json", { cache: "no-store" });
      if (!response.ok) throw Error();
      const data = mergeMechanicCatalog(await response.json());
      if (!Array.isArray(data.professions) || !data.revision) throw Error();
      setCatalog(data);
      // Independent snapshot: failure leaves the editor usable and can be retried.
      try {
        const weapons = await fetch("./weapon-skills.json", {
          cache: "no-store",
        });
        if (!weapons.ok) throw Error();
        const snapshot = await weapons.json();
        if (
          snapshot.schema !== 1 ||
          !Array.isArray(snapshot.skills) ||
          !snapshot.skills.length
        )
          throw Error();
        setCatalog(mergeSkillCatalog(data, snapshot.skills));
      } catch {
        setWeaponError(true);
        work.setMessage(
          "武器技能资料加载失败，可点击重新加载；当前配装仍保留。",
        );
      }
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
                <span
                  className={`build-state${work.dirty && !work.readonly ? " is-dirty" : ""}`}
                >
                  {work.readonly
                    ? "分享快照"
                    : work.dirty
                      ? "尚未保存"
                      : work.savedStatus}
                </span>
              </span>
            </div>
          </div>
          <div className="toolbar-actions">
            <button
              title="查看随网站发布的公开 BD；本地修改需手动同步 GitHub 并部署后才会更新。"
              onClick={() => setPublishedOpen(true)}
            >
              公开 BD 库
            </button>
            <button title="创建当前职业的空白配装。" onClick={work.newBuild}>
              新建
            </button>
            {work.readonly ? (
              <button
                title="创建可编辑的独立副本，保留原分享或公开 BD。"
                onClick={work.copy}
              >
                复制编辑
              </button>
            ) : null}
            <button
              title="下载当前 BD 的 JSON 文件；保存位置和同名文件处理由浏览器决定，GitHub 需手动同步。"
              onClick={work.exportFile}
            >
              下载 BD
            </button>
            <button
              className="primary"
              title="生成并尝试复制当前配装快照链接，包含描述；之后的修改需重新分享。"
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
          download={work.exportFile}
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
        {weaponError && (
          <div className="notice">
            <span>武器技能资料暂不可用。</span>
            <button onClick={() => void load()} disabled={loading}>
              重新加载武器技能
            </button>
          </div>
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
            {work.legacyBackup && (
              <button
                title="只读查看旧浏览器配装并下载迁移，不会新增或清理浏览器记录。"
                onClick={work.showLegacyBackup}
              >
                迁移旧浏览器配装
              </button>
            )}
            <button
              title="导入单个 BD 为独立草稿，或读取旧整库备份用于下载迁移；要更新原 BD 文件，请从已连接的文件夹载入。"
              onClick={() => file.current?.click()}
            >
              导入 JSON
            </button>
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
      {work.recovery && (
        <BuildRecovery
          backup={work.recovery}
          close={work.closeRecovery}
          open={(b) => {
            if (work.replace({ ...b, id: crypto.randomUUID() }, true))
              work.closeRecovery();
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
