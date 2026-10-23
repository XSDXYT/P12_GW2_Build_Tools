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
import { downloadBuild, readLegacyBackup } from "../storage";
import { parseLibraryBackup, type LibraryBackup } from "../library";
import type { Edit } from "../editor";
export function useWorkspace() {
  const loadSequence = useRef(0);
  const [build, setBuild] = useState<Build>(createBuild),
    [readonly, setReadonly] = useState(false),
    [dirty, setDirty] = useState(false),
    [legacyBackup, setLegacyBackup] = useState<LibraryBackup | null>(null),
    [recovery, setRecovery] = useState<LibraryBackup | null>(null),
    [savedStatus, setSavedStatus] = useState("已就绪"),
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
      const backup = readLegacyBackup();
      if (backup?.builds.length) setLegacyBackup(backup);
    } catch {
      setMessage(
        "旧浏览器配装读取失败，原始记录保留；仍可导入本地 JSON。请勿清理网站数据。",
      );
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
    setSavedStatus("已就绪");
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
    setSavedStatus("已就绪");
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
  function exportFile() {
    try {
      downloadBuild(build);
      setDirty(false);
      setSavedStatus("已发起下载");
      setMessage(
        "已发起 BD JSON 下载，请确认浏览器已保存文件。GitHub 同步仍需手动执行。",
      );
    } catch {
      setMessage("下载失败，当前草稿保留。请重试或连接 BD 文件夹保存。");
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw Error("文件过大");
      const text = await file.text();
      if (JSON.parse(text)?.type === "p12-library") {
        const backup = parseLibraryBackup(text);
        setRecovery(backup);
        setMessage(
          "已读取旧配装库备份，可逐个下载或载入编辑；当前草稿保留，未写入浏览器。",
        );
        return;
      }
      if (file.size > 262144) throw Error("单个配装文件过大");
      const next = parseBuild(text);
      next.id = crypto.randomUUID();
      if (replace(next, true))
        setMessage("已导入为独立草稿，检查后可下载或保存到 BD 文件夹。");
    } catch {
      setMessage("导入失败：文件过大、格式错误或版本不支持。原配装未修改。");
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
    legacyBackup,
    recovery,
    showLegacyBackup: () => setRecovery(legacyBackup),
    closeRecovery: () => setRecovery(null),
    savedStatus,
    message,
    setMessage,
    shareLink,
    undo,
    edit,
    replace,
    importFile,
    share,
    copy,
    undoEdit,
    newBuild: () => replace(createBuild(build.profession)),
    openPublished,
    markFileSaved: (saved: Build) => {
      if (JSON.stringify(latestBuild.current) === JSON.stringify(saved)) {
        setDirty(false);
        setSavedStatus("已保存到文件");
      }
    },
    exportFile,
  };
}
