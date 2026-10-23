import { useEffect, useRef, useState } from "react";
import { issues, type Build, type Catalog } from "../domain";
import {
  readBuildDirectory,
  readBuildFile,
  writeBuildFile,
  type BuildDirectoryHandle,
} from "../build-files";
import { BuildArchive } from "./BuildArchive";

export function BuildFolder({
  build,
  catalog,
  notify,
  open,
  saved,
  download,
}: {
  build: Build;
  catalog: Catalog | null;
  notify: (message: string) => void;
  open: (build: Build) => boolean;
  saved: (build: Build) => void;
  download: () => void;
}) {
  const [directory, setDirectory] = useState<BuildDirectoryHandle | null>(null);
  const [entries, setEntries] = useState<Build[]>([]);
  const filenames = useRef(new Map<string, string>());
  const [busy, setBusy] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState(0);
  const locked = useRef(false);
  const selection = useRef(0);
  const latestBuild = useRef(build);
  latestBuild.current = build;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      selection.current++;
    };
  }, []);
  function lock() {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    return true;
  }
  function unlock() {
    locked.current = false;
    if (alive.current) setBusy(false);
  }
  function applyDirectory(
    chosen: BuildDirectoryHandle,
    loaded: Awaited<ReturnType<typeof readBuildDirectory>>,
  ) {
    setDirectory(chosen);
    setEntries(loaded.builds);
    filenames.current = loaded.filenames;
    setSkipped(loaded.skipped.length);
    setError("");
  }
  async function connect(showLibrary = false) {
    if (!window.showDirectoryPicker) {
      notify(
        "此浏览器暂不支持直接连接文件夹。可使用“导入 JSON”载入单个 BD，用“下载 BD”保存文件。",
      );
      return;
    }
    if (!lock()) return;
    try {
      const chosen = await window.showDirectoryPicker({
        id: "p12-bd-folder",
        mode: "readwrite",
      });
      const loaded = await readBuildDirectory(chosen);
      if (!alive.current) return;
      applyDirectory(chosen, loaded);
      if (showLibrary) setLibraryOpen(true);
      notify(
        `已连接“${chosen.name}”，读取 ${loaded.builds.length} 个 BD${loaded.skipped.length ? `，跳过 ${loaded.skipped.length} 个非兼容或重复文件` : ""}。文件夹仅在本次打开期间连接。`,
      );
    } catch (error) {
      if (
        alive.current &&
        !(error instanceof DOMException && error.name === "AbortError")
      ) {
        setError(
          "连接文件夹失败，原目录和当前草稿保留。请检查读取权限或文件数量（最多 1000 个 JSON）。",
        );
        notify("连接文件夹失败，当前配装保留。请检查目录读取权限及文件数量。");
      }
    } finally {
      unlock();
    }
  }
  async function refresh(showLibrary = false) {
    if (!directory) return connect(showLibrary);
    if (!lock()) return;
    if (showLibrary) setLibraryOpen(true);
    try {
      const loaded = await readBuildDirectory(directory);
      if (alive.current) applyDirectory(directory, loaded);
    } catch {
      if (alive.current)
        setError(
          "刷新文件夹失败，保留上次读取的列表和当前草稿。请检查权限及文件数量，或重新选择文件夹。",
        );
    } finally {
      unlock();
    }
  }
  function closeLibrary() {
    selection.current++;
    setLibraryOpen(false);
  }
  async function openFile(id: string) {
    const filename = filenames.current.get(id);
    if (!directory || !filename || !lock()) return false;
    setError("");
    const token = selection.current;
    const before = JSON.stringify(latestBuild.current);
    try {
      const current = await readBuildFile(directory, filename, id);
      if (!alive.current || selection.current !== token) return false;
      if (JSON.stringify(latestBuild.current) !== before)
        throw Error("读取期间配装已变化，请重新载入。");
      const accepted = open(current);
      if (accepted) {
        setEntries((previous) =>
          previous.map((entry) => (entry.id === id ? current : entry)),
        );
        setError("");
      }
      return accepted;
    } finally {
      unlock();
    }
  }
  async function save() {
    if (!directory) {
      download();
      return;
    }
    if (catalog) {
      const errors = issues(build, catalog);
      if (errors.length) {
        notify("请先修正：" + errors.join("；"));
        return;
      }
    }
    if (!lock()) return;
    try {
      const filename = await writeBuildFile(
        directory,
        build,
        filenames.current.get(build.id),
      );
      if (!alive.current) return;
      filenames.current.set(build.id, filename);
      setEntries((previous) => [
        structuredClone(build),
        ...previous.filter((b) => b.id !== build.id),
      ]);
      saved(build);
      notify(
        `已保存到“${directory.name}/${filename}”。GitHub 同步由你手动执行。`,
      );
    } catch {
      if (alive.current)
        notify(
          "文件保存失败，当前草稿保留。请检查写入权限及同名文件，或使用“下载 BD”。",
        );
    } finally {
      unlock();
    }
  }
  return (
    <>
      <div className="build-folder" aria-label="BD文件夹">
        <button
          type="button"
          title="选择并授权本次使用的本地 BD 文件夹，读取其中的配装；GitHub 仍需手动同步。"
          onClick={() => void connect()}
          disabled={busy}
        >
          {directory ? "更换 BD 文件夹" : "连接 BD 文件夹"}
        </button>
        <button
          type="button"
          aria-label="本地 BD 库"
          title="浏览授权文件夹中的 BD 卡片，支持搜索和分类；只读取本地文件，不上传或保存到浏览器。"
          onClick={() => void refresh(true)}
          disabled={busy}
        >
          本地 BD 库{" "}
          {directory && <span aria-hidden="true">({entries.length})</span>}
        </button>
        <button
          type="button"
          title={
            !directory
              ? "尚未连接文件夹：点击会下载 JSON，请手动放入 BD 文件夹；不会同步 GitHub。"
              : filenames.current.has(build.id)
                ? "写回此 BD 的原文件，修改标题也保留原文件名；GitHub 需手动同步并部署。"
                : "保存到已连接的文件夹：同 ID 文件可更新，新 BD 按标题命名，其他 BD 重名时另加编号；GitHub 需手动同步并部署。"
          }
          onClick={() => void save()}
          disabled={busy}
        >
          保存到 BD 文件夹
        </button>
        {directory && (
          <>
            <span>已连接：{directory.name}</span>
            <label className="sr-only" htmlFor="folder-build">
              载入文件夹中的 BD
            </label>
            <select
              id="folder-build"
              aria-label="载入文件夹中的BD"
              title="载入原 BD 文件后编辑并保存，可更新同一份文件；仅修改标题不会重命名文件。"
              disabled={busy}
              value=""
              onChange={(event) => {
                const id = event.target.value;
                if (id)
                  void openFile(id).catch(() =>
                    notify(
                      "文件读取失败或内容已变化，当前草稿保留。请打开本地 BD 库刷新后重试。",
                    ),
                  );
              }}
            >
              <option value="">载入 BD 文件（{entries.length}）</option>
              {entries.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      {libraryOpen && directory && (
        <BuildArchive
          source="local"
          entries={entries}
          ready
          loading={busy}
          error={error}
          description={`文件夹：${directory.name}。直接读取本地 JSON${skipped ? `，已跳过 ${skipped} 个非兼容、无法读取或重复文件` : ""}；刷新页面后需重新连接。`}
          filename={(id) => filenames.current.get(id)}
          actions={
            <>
              <button
                title="重新扫描文件夹，读取外部新增、修改或删除后的列表。"
                disabled={busy}
                onClick={() => void refresh()}
              >
                刷新文件夹
              </button>
              <button
                title="授权并读取另一个本地 BD 文件夹。"
                disabled={busy}
                onClick={() => void connect(true)}
              >
                更换 BD 文件夹
              </button>
            </>
          }
          close={closeLibrary}
          open={openFile}
          reload={() => void refresh()}
        />
      )}
    </>
  );
}
