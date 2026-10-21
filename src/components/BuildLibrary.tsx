import { useEffect, useRef, useState } from "react";
import { professions } from "../editor";
import type { Build } from "../domain";
import {
  buildMetadata,
  filterLibrary,
  parseTags,
  type BuildMetadata,
  type LibraryMetadata,
} from "../library";

export function BuildLibrary({
  entries,
  metadata,
  onMetadata,
  onBackup,
  onClose,
  onOpen,
  onRemove,
  onCopy,
  onImport,
}: {
  entries: Build[];
  metadata: LibraryMetadata;
  onMetadata: (id: string, value: BuildMetadata) => boolean;
  onBackup: () => void;
  onClose: () => void;
  onOpen: (b: Build) => void;
  onRemove: (id: string) => void;
  onCopy: (b: Build) => void;
  onImport: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [profession, setProfession] = useState("");
  const [tag, setTag] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const tags = [
    ...new Set(entries.flatMap((b) => buildMetadata(metadata, b.id).tags)),
  ].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const filtered = filterLibrary(entries, metadata, {
    query,
    profession,
    tag,
    favorites,
  });
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    if (tag && !tags.includes(tag)) setTag("");
  }, [tag, tags.join("\n")]);
  return (
    <dialog
      className="library"
      ref={ref}
      aria-label="我的配装"
      onCancel={onClose}
    >
      <div className="library-heading">
        <div>
          <small>BUILD LIBRARY</small>
          <h2>
            我的配装 <span>{entries.length}</span>
          </h2>
        </div>
        <button aria-label="关闭配装库" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="muted">
        保存在当前浏览器。换网址或设备前，可备份配装库并在新网址导入。
      </p>
      <div className="library-filters">
        <label>
          名称搜索
          <input
            type="search"
            aria-label="搜索配装名称"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入配装名称"
          />
        </label>
        <label>
          职业
          <select
            aria-label="筛选配装职业"
            value={profession}
            onChange={(e) => setProfession(e.target.value)}
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
          标签
          <select
            aria-label="筛选配装标签"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          >
            <option value="">全部标签</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="library-favorite-filter">
          <input
            type="checkbox"
            checked={favorites}
            onChange={(e) => setFavorites(e.target.checked)}
          />
          仅看收藏
        </label>
      </div>
      <p className="library-count" aria-live="polite">
        显示 {filtered.length} / {entries.length} 个配装
      </p>
      {error && (
        <p role="alert" className="library-error">
          {error}
        </p>
      )}
      <div className="library-list">
        {filtered.map((build) => {
          const info = buildMetadata(metadata, build.id);
          return (
            <div className="library-card" key={build.id}>
              <div className="library-row">
                <button className="library-open" onClick={() => onOpen(build)}>
                  <strong>{build.name}</strong>
                  <small>{professions[build.profession]} · 陆地 PvE</small>
                </button>
                <button
                  aria-label={`${info.favorite ? "取消收藏" : "收藏"}${build.name}`}
                  aria-pressed={info.favorite}
                  className="library-star"
                  onClick={() => {
                    setError(
                      onMetadata(build.id, {
                        ...info,
                        favorite: !info.favorite,
                      })
                        ? ""
                        : "收藏保存失败，请检查浏览器存储。",
                    );
                  }}
                >
                  {info.favorite ? "★" : "☆"}
                </button>
                <button
                  aria-label={`编辑标签${build.name}`}
                  onClick={() => {
                    setEditing(build.id);
                    setDraft(info.tags.join("，"));
                    setError("");
                  }}
                >
                  标签
                </button>
                <button
                  onClick={() => onCopy(build)}
                  aria-label={`复制${build.name}`}
                >
                  复制
                </button>
                <button
                  onClick={() => {
                    if (confirm(`删除“${build.name}”？建议先导出备份。`))
                      onRemove(build.id);
                  }}
                  aria-label={`删除${build.name}`}
                >
                  删除
                </button>
              </div>
              {!!info.tags.length && (
                <div className="library-tags">
                  {info.tags.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTag(t)}
                      aria-label={`筛选标签${t}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
              {editing === build.id && (
                <form
                  className="library-tag-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    try {
                      const tags = parseTags(draft);
                      if (!onMetadata(build.id, { ...info, tags })) {
                        setError(
                          "标签保存失败，输入仍保留，请检查浏览器存储。",
                        );
                        return;
                      }
                      setEditing(null);
                      setError("");
                    } catch (error) {
                      setError(
                        error instanceof Error ? error.message : "标签无效。",
                      );
                    }
                  }}
                >
                  <label>
                    标签（逗号分隔，最多 8 个）
                    <input
                      aria-label={`${build.name}的标签`}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="例如：碎层，直伤，日常"
                      maxLength={256}
                      autoFocus
                    />
                  </label>
                  <button type="submit">保存标签</button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      setError("");
                    }}
                  >
                    取消
                  </button>
                </form>
              )}
            </div>
          );
        })}
        {!filtered.length && (
          <div className="empty-library">
            {entries.length ? "没有匹配的配装" : "还没有保存的配装"}
            <small>
              {entries.length
                ? "试试其他职业、标签或名称。"
                : "完成选择后，点击工具栏中的保存。"}
            </small>
            {!!entries.length && (
              <button
                onClick={() => {
                  setQuery("");
                  setProfession("");
                  setTag("");
                  setFavorites(false);
                }}
              >
                清除筛选
              </button>
            )}
          </div>
        )}
      </div>
      <div className="library-footer">
        <button onClick={onImport}>导入 JSON</button>
        <button onClick={onBackup} disabled={!entries.length}>
          备份配装库
        </button>
        <button className="primary" onClick={onClose}>
          返回工作台
        </button>
      </div>
    </dialog>
  );
}
