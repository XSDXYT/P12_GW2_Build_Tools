import { useEffect, useRef, useState } from "react";
import type { Build } from "../domain";
import type { LibraryBackup } from "../library";
import { downloadBuild, downloadJson } from "../storage";
import { professions } from "../editor";

export function BuildRecovery({
  backup,
  close,
  open,
}: {
  backup: LibraryBackup;
  close: () => void;
  open: (build: Build) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function download(action: () => void) {
    try {
      action();
      setMessage("已发起旧配装下载，请确认文件已保存；原始浏览器记录未清理。");
    } catch {
      setMessage("下载失败，请重试。原始记录及当前草稿保留。");
    }
  }
  return (
    <dialog
      className="library"
      ref={dialog}
      aria-label="旧配装迁移"
      onCancel={close}
    >
      <div className="library-heading">
        <h2>
          旧配装迁移 <span>{backup.builds.length}</span>
        </h2>
        <button aria-label="关闭旧配装迁移" onClick={close}>
          ×
        </button>
      </div>
      <p className="muted">
        浏览器保存功能已移除。可逐个下载旧
        BD，或载入为独立草稿编辑后保存到文件。整库下载保留旧个人标签及收藏。
      </p>
      {message && <p role="status">{message}</p>}
      <div className="library-list">
        {backup.builds.map((build) => (
          <div className="library-card" key={build.id}>
            <div className="library-row">
              <div className="library-open">
                <strong>{build.name}</strong>
                <small>{professions[build.profession]}</small>
              </div>
              <button
                title="下载此旧 BD 的 JSON 文件。"
                aria-label={`下载${build.name}`}
                onClick={() => download(() => downloadBuild(build))}
              >
                下载 JSON
              </button>
              <button
                title="作为独立草稿载入，原始记录保留。"
                aria-label={`载入${build.name}`}
                onClick={() => open(build)}
              >
                载入编辑
              </button>
            </div>
          </div>
        ))}
        {!backup.builds.length && <p className="muted">此备份没有配装记录。</p>}
      </div>
      <div className="library-footer">
        <button
          title="下载整份旧备份，保留其中的个人标签及收藏。"
          onClick={() =>
            download(() => downloadJson(backup, "P12-旧配装库备份"))
          }
        >
          下载旧整库备份
        </button>
        <button onClick={close}>返回工作台</button>
      </div>
    </dialog>
  );
}
