import { useEffect, useState } from "react";
import {
  createBuild,
  decodeShare,
  encodeShare,
  issues,
  parseBuild,
  type Build,
  type Catalog,
} from "../domain";
import { readLibrary, saveBuild, deleteBuild, downloadBuild } from "../storage";
import {
  readLibraryMetadata,
  saveBuildMetadata,
  importLibraryBackup,
  downloadJson,
} from "../storage";
import {
  createLibraryBackup,
  parseLibraryBackup,
  type BuildMetadata,
  type LibraryMetadata,
} from "../library";
import type { Edit } from "../editor";
export function useWorkspace() {
  const [build, setBuild] = useState<Build>(createBuild),
    [readonly, setReadonly] = useState(false),
    [dirty, setDirty] = useState(false),
    [library, setLibrary] = useState<Build[]>([]),
    [metadata, setMetadata] = useState<LibraryMetadata>({}),
    [message, setMessage] = useState(""),
    [shareLink, setShareLink] = useState(""),
    [undo, setUndo] = useState<{
      build: Build;
      dirty: boolean;
      label: string;
    } | null>(null);
  useEffect(() => {
    try {
      const saved = readLibrary();
      setLibrary(saved);
      if (saved[0]) setBuild(saved[0]);
    } catch (e) {
      setMessage(String(e));
    }
    try {
      setMetadata(readLibraryMetadata());
    } catch {
      setMessage("分类资料读取失败，原始分类仍保留，配装可继续使用。");
    }
    const onHash = () => {
      if (location.hash.startsWith("#build=")) {
        try {
          setBuild(decodeShare(location.hash.slice(7)));
          setReadonly(true);
          setDirty(false);
          setUndo(null);
          setShareLink("");
        } catch {
          setMessage("无法打开分享：链接损坏、过长或版本不支持。");
        }
      }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const edit: Edit = (change, label) => {
    if (readonly) return;
    const next = structuredClone(build);
    change(next);
    setUndo(label ? { build: structuredClone(build), dirty, label } : null);
    setBuild(next);
    setDirty(true);
    setShareLink("");
    if (!label) setMessage("");
  };
  function replace(next: Build, markDirty = false, confirmDiscard = true) {
    if (
      confirmDiscard &&
      dirty &&
      !confirm("当前修改尚未保存，仍要切换配装吗？")
    )
      return false;
    setBuild(structuredClone(next));
    setReadonly(false);
    setDirty(markDirty);
    setUndo(null);
    setShareLink("");
    setMessage("");
    history.replaceState(null, "", location.pathname + location.search);
    return true;
  }
  function save() {
    try {
      setLibrary(saveBuild(build));
      setDirty(false);
      setMessage("配装已保存在此浏览器。");
    } catch {
      setMessage(
        "保存失败，本地记录或存储空间不可用。草稿仍保留，可导出备份。",
      );
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw Error("文件过大");
      const text = await file.text();
      if (JSON.parse(text)?.type === "p12-library") {
        const backup = parseLibraryBackup(text);
        const next = importLibraryBackup(backup);
        setLibrary(next.builds);
        setMetadata(next.metadata);
        setMessage(
          `已导入 ${backup.builds.length} 个配装及分类，原配装保留；当前草稿未改变。`,
        );
        return;
      }
      if (file.size > 262144) throw Error("单个配装文件过大");
      const next = parseBuild(text);
      next.id = crypto.randomUUID();
      if (replace(next, true)) setMessage("已导入为独立草稿，检查后可保存。");
    } catch {
      setMessage(
        "导入失败：文件过大、格式错误、版本不支持或存储不可用。原配装未修改。",
      );
    }
  }
  function updateMetadata(id: string, value: BuildMetadata): boolean {
    try {
      setMetadata(saveBuildMetadata(id, value));
      return true;
    } catch {
      setMessage("分类保存失败，原始分类仍保留，请先备份检查浏览器存储。");
      return false;
    }
  }
  function exportLibrary() {
    try {
      downloadJson(
        createLibraryBackup(readLibrary(), readLibraryMetadata()),
        "P12-配装库备份",
      );
    } catch {
      setMessage("配装库备份失败，原始记录仍保留。可先导出当前配装检查存储。");
    }
  }
  async function share(catalog: Catalog) {
    const errors = issues(build, catalog, true);
    if (errors.length) {
      setMessage("请先修正：" + errors.join("；"));
      return;
    }
    try {
      const url =
        location.origin + location.pathname + "#build=" + encodeShare(build);
      setShareLink(url);
      try {
        await navigator.clipboard.writeText(url);
        setMessage("分享链接已复制。任何持有链接的人均可查看。");
      } catch {
        setMessage("链接已生成，请手动复制。");
      }
    } catch (e) {
      setMessage(String(e));
    }
  }
  function remove(id: string) {
    try {
      setLibrary(deleteBuild(id));
    } catch {
      setMessage("删除失败，原记录保留。");
    }
  }
  function copy() {
    replace(
      {
        ...build,
        id: crypto.randomUUID(),
        name: (build.name + " · 副本").slice(0, 80),
      },
      true,
      !readonly,
    );
  }
  function undoEdit() {
    if (!undo) return;
    setBuild(undo.build);
    setDirty(undo.dirty);
    setMessage(`已撤销${undo.label}。`);
    setUndo(null);
    setShareLink("");
  }
  return {
    build,
    readonly,
    dirty,
    library,
    metadata,
    updateMetadata,
    exportLibrary,
    message,
    setMessage,
    shareLink,
    undo,
    edit,
    replace,
    save,
    importFile,
    share,
    remove,
    copy,
    undoEdit,
    newBuild: () => replace(createBuild(build.profession)),
    exportFile: () => downloadBuild(build),
  };
}
