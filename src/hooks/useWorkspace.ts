import { useEffect, useRef, useState } from "react";
import { readPublishedBuild } from "../collection";
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
  const loadSequence = useRef(0);
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
  const latestBuild = useRef(build);
  latestBuild.current = build;
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
      const sequence = ++loadSequence.current;
      if (location.hash.startsWith("#bd=")) {
        let id: string;
        try {
          id = decodeURIComponent(location.hash.slice(4));
          if (id.length > 80) throw Error();
        } catch {
          setMessage("公开 BD 链接格式错误，当前配装保留。");
          return;
        }
        void readPublishedBuild(id)
          .then((next) => {
            if (loadSequence.current !== sequence) return;
            setBuild(next);
            setReadonly(true);
            setDirty(false);
            setUndo(null);
            setShareLink("");
            setMessage("");
          })
          .catch(() => {
            if (loadSequence.current === sequence)
              setMessage("无法读取公开 BD，当前配装保留。请在公开 BD 库重试。");
          });
        return;
      }
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
    return () => {
      ++loadSequence.current;
      window.removeEventListener("hashchange", onHash);
    };
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
    ++loadSequence.current;
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
    ++loadSequence.current;
    setBuild(structuredClone(next));
    setReadonly(false);
    setDirty(markDirty);
    setUndo(null);
    setShareLink("");
    setMessage("");
    history.replaceState(null, "", location.pathname + location.search);
    return true;
  }
  async function openPublished(id: string): Promise<boolean> {
    if (dirty && !confirm("当前修改尚未保存，仍要打开公开 BD 吗？"))
      return false;
    const sequence = ++loadSequence.current;
    setMessage("正在读取公开 BD…");
    try {
      const next = await readPublishedBuild(id);
      if (loadSequence.current !== sequence) return false;
      setBuild(next);
      setReadonly(true);
      setDirty(false);
      setUndo(null);
      setShareLink("");
      setMessage("");
      history.replaceState(
        null,
        "",
        location.pathname + location.search + "#bd=" + encodeURIComponent(id),
      );
      return true;
    } catch {
      if (loadSequence.current === sequence)
        setMessage("公开 BD 读取失败，当前配装保留。请重试或导入本地 JSON。");
      return false;
    }
  }
  function cacheBuild() {
    try {
      setLibrary(saveBuild({ ...build, id: crypto.randomUUID() }));
      setMessage(
        "已将此 BD 作为独立记录存到当前浏览器。可在“我的配装”打开或下载到本地。",
      );
    } catch {
      setMessage("浏览器缓存失败，当前 BD 仍可下载 JSON。");
    }
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
    const errors = issues(build, catalog);
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
    ++loadSequence.current;
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
    openPublished,
    cacheBuild,
    markFileSaved: (saved: Build) => {
      if (JSON.stringify(latestBuild.current) === JSON.stringify(saved))
        setDirty(false);
    },
    exportFile: () => downloadBuild(build),
  };
}
