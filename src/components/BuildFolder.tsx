import { useRef, useState } from "react";
import { issues, type Build, type Catalog } from "../domain";
import {
  readBuildDirectory,
  writeBuildFile,
  type BuildDirectoryHandle,
} from "../build-files";
import { downloadBuild } from "../storage";
export function BuildFolder({
  build,
  catalog,
  notify,
  open,
  saved,
}: {
  build: Build;
  catalog: Catalog | null;
  notify: (message: string) => void;
  open: (build: Build) => boolean;
  saved: (build: Build) => void;
}) {
  const [directory, setDirectory] = useState<BuildDirectoryHandle | null>(null);
  const [entries, setEntries] = useState<Build[]>([]);
  const filenames = useRef(new Map<string, string>());
  const [busy, setBusy] = useState(false);
  async function connect() {
    if (!window.showDirectoryPicker) {
      notify(
        "此浏览器暂不支持直接连接文件夹。可使用导出 JSON 下载，再放入自己的 BD 文件夹。",
      );
      return;
    }
    try {
      const chosen = await window.showDirectoryPicker({
        id: "p12-bd-folder",
        mode: "readwrite",
      });
      setBusy(true);
      const loaded = await readBuildDirectory(chosen);
      setDirectory(chosen);
      setEntries(loaded.builds);
      filenames.current = loaded.filenames;
      notify(
        `已连接“${chosen.name}”，读取 ${loaded.builds.length} 个 BD${loaded.skipped.length ? `，跳过 ${loaded.skipped.length} 个非兼容或重复文件` : ""}。文件夹仅在本次打开期间连接。`,
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        notify("连接文件夹失败，当前配装保留。请检查目录读取权限。");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!directory) {
      downloadBuild(build);
      notify(
        "已下载 BD JSON，请移入自己的 BD 文件夹。也可先连接文件夹后直接保存。",
      );
      return;
    }
    if (catalog) {
      const errors = issues(build, catalog);
      if (errors.length) {
        notify("请先修正：" + errors.join("；"));
        return;
      }
    }
    setBusy(true);
    try {
      const filename = await writeBuildFile(
        directory,
        build,
        filenames.current.get(build.id),
      );
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
      notify(
        "文件保存失败，当前草稿保留。请检查写入权限及同名文件，或改用导出 JSON。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="build-folder" aria-label="BD文件夹">
      <button type="button" onClick={() => void connect()} disabled={busy}>
        {directory ? "更换 BD 文件夹" : "连接 BD 文件夹"}
      </button>
      <button type="button" onClick={() => void save()} disabled={busy}>
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
            disabled={busy}
            value=""
            onChange={(event) => {
              const selected = entries.find((b) => b.id === event.target.value);
              if (selected) open(selected);
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
  );
}
