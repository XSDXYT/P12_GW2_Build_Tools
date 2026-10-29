import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type { Build, Catalog } from "../domain";
import type { AttributeData } from "../attributes";
import {
  captureBuildImage,
  downloadPng,
  pngArchive,
  pngFilename,
  pngPartFilename,
} from "../build-image";
import { BuildImageSheet } from "./BuildImageSheet";
import "../build-image.css";

type ImagePage = Awaited<
  ReturnType<typeof captureBuildImage>
>["pages"][number] & {
  url: string;
};
type ImageResult = { pages: ImagePage[]; missing: number };
export function ScreenshotShare({
  build,
  catalog,
  disabled = false,
}: {
  build: Build;
  catalog: Catalog | null;
  disabled?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<Build | null>(null);
  const [description, setDescription] = useState(true),
    [scale, setScale] = useState(2);
  const [data, setData] = useState<AttributeData | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [image, setImage] = useState<ImageResult | null>(null);
  const [pageIndex, setPageIndex] = useState(0),
    [packing, setPacking] = useState(false);
  const activePage = image?.pages[pageIndex];
  const working = busy || packing;
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    sheet = useRef<HTMLDivElement>(null);
  const job = useRef<AbortController | null>(null),
    generation = useRef(0);
  const opened = !!snapshot;
  useLayoutEffect(() => {
    if (!opened) return;
    const current = dialog.current;
    current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      current?.close();
      document.body.style.overflow = previous;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [opened]);
  useEffect(
    () => () => {
      job.current?.abort();
      generation.current++;
    },
    [],
  );
  useEffect(
    () => () => {
      image?.pages.forEach((page) => URL.revokeObjectURL(page.url));
    },
    [image],
  );
  function close() {
    job.current?.abort();
    generation.current++;
    setSnapshot(null);
    setBusy(false);
    setPacking(false);
    setImage(null);
    setPageIndex(0);
    setError("");
    setMessage("");
  }
  async function generate() {
    if (working || !snapshot || !catalog) return;
    const controller = new AbortController();
    job.current = controller;
    const id = ++generation.current;
    setBusy(true);
    setError("");
    setImage(null);
    setPageIndex(0);
    setMessage("正在准备配装资料…");
    try {
      if (!data) {
        const response = await fetch("./attribute-data.json", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw Error("属性资料暂不可用，请稍后重试生成。");
        const value = await response.json();
        if (!value.profiles?.head || !value.items)
          throw Error("属性资料暂不可用，请稍后重试生成。");
        controller.signal.throwIfAborted();
        // Ensure the export sheet exists before measuring it, including WebKit
        // where a queued state update may commit after the animation frame.
        flushSync(() => setData(value));
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      controller.signal.throwIfAborted();
      const node = sheet.current?.firstElementChild as HTMLElement | null;
      if (!node) throw Error("配装画面尚未准备好，请重试。");
      const result = await captureBuildImage(
        node,
        scale,
        controller.signal,
        (m) => {
          if (generation.current === id) setMessage(m);
        },
      );
      if (generation.current !== id) return;
      setImage({
        ...result,
        pages: result.pages.map((page) => ({
          ...page,
          url: URL.createObjectURL(page.blob),
        })),
      });
      setMessage(
        (result.pages.length > 1
          ? `已自动分成 ${result.pages.length} 张高清图，每张宽 ${result.pages[0].width} 像素；完整内容均已保留，相邻图片略有重叠。可逐张下载或打包下载全部 PNG。`
          : `长图已生成：${result.pages[0].width} × ${result.pages[0].height} 像素。`) +
          (result.missing
            ? `${result.missing} 张图片未能载入，已保留文字。`
            : ""),
      );
    } catch (e) {
      if (!controller.signal.aborted && generation.current === id) {
        setError(
          e instanceof Error
            ? e.message
            : "长图生成失败，请改用标准清晰度或重试。",
        );
        setMessage("");
      }
    } finally {
      if (generation.current === id) {
        setBusy(false);
        job.current = null;
      }
    }
  }
  function changeOptions(update: () => void) {
    update();
    setImage(null);
    setPageIndex(0);
    setError("");
    setMessage("");
  }
  const filename = pngFilename(snapshot?.name || build.name);
  const partFilename = pngPartFilename(
    filename,
    pageIndex,
    image?.pages.length || 1,
  );
  const file = activePage
    ? new File([activePage.blob], partFilename, { type: "image/png" })
    : null;
  let canShare = false;
  try {
    canShare =
      !!file &&
      typeof navigator.share === "function" &&
      !!navigator.canShare?.({ files: [file] });
  } catch {
    /* Download remains available when system sharing is restricted. */
  }
  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: snapshot?.name });
      setMessage("已完成系统分享操作。");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError("系统分享未完成，可以使用“下载 PNG”保存后分享。");
    }
  }
  async function downloadAll() {
    if (!image || working) return;
    const id = generation.current;
    setPacking(true);
    setError("");
    setMessage("正在打包全部 PNG…");
    try {
      const archive = await pngArchive(image.pages, filename);
      if (generation.current !== id) return;
      downloadPng(archive, filename.replace(/\.png$/iu, ".zip"));
      setMessage(
        `已发起 ${image.pages.length} 张 PNG 的打包下载，解压 ZIP 后即可分享。`,
      );
    } catch {
      if (generation.current === id)
        setError("打包未完成，可以切换图片后逐张下载 PNG。");
    } finally {
      if (generation.current === id) setPacking(false);
    }
  }
  return (
    <>
      <button
        ref={trigger}
        disabled={!catalog || disabled}
        title={
          !catalog || disabled
            ? "配装资料尚未就绪，完成加载后可导出完整长图。"
            : "将当前配装配置与可选的BD讲解导出为高清PNG长图，保存后可分享。"
        }
        onClick={() => {
          setSnapshot(structuredClone(build));
          setImage(null);
          setError("");
          setMessage("");
        }}
      >
        截图分享
      </button>
      {opened &&
        catalog &&
        createPortal(
          <>
            <dialog
              className="image-share-dialog"
              ref={dialog}
              aria-label="截图分享"
              onCancel={(e) => {
                e.preventDefault();
                close();
              }}
            >
              <header>
                <div>
                  <small>PNG · 配装长图</small>
                  <h2>截图分享</h2>
                </div>
                <button type="button" aria-label="关闭截图分享" onClick={close}>
                  ×
                </button>
              </header>
              <p className="image-share-intro">
                导出装备、技能特性和基础属性，讲解会按 Markdown
                排版。超长内容自动分成多张，保持所选清晰度。威能、激怒等临时预览状态不计入图片。
              </p>
              <div className="image-share-options">
                <label>
                  清晰度
                  <select
                    aria-label="长图清晰度"
                    disabled={working}
                    value={scale}
                    onChange={(e) =>
                      changeOptions(() => setScale(+e.target.value))
                    }
                  >
                    <option value={2}>高清 · 2 倍（宽 2000 像素）</option>
                    <option value={1}>标准 · 1 倍（宽 1000 像素）</option>
                  </select>
                </label>
                <label className="image-share-check">
                  <input
                    type="checkbox"
                    checked={description}
                    disabled={working}
                    onChange={(e) =>
                      changeOptions(() => setDescription(e.target.checked))
                    }
                  />
                  附带 BD 描述与讲解
                </label>
              </div>
              {image && image.pages.length > 1 && (
                <div className="image-share-pagination" aria-label="分图浏览">
                  <button
                    disabled={working || pageIndex === 0}
                    onClick={() => setPageIndex(pageIndex - 1)}
                  >
                    上一张
                  </button>
                  <span aria-live="polite">
                    第 {pageIndex + 1} / {image.pages.length} 张 ·{" "}
                    {activePage?.width} × {activePage?.height} 像素
                  </span>
                  <button
                    disabled={working || pageIndex === image.pages.length - 1}
                    onClick={() => setPageIndex(pageIndex + 1)}
                  >
                    下一张
                  </button>
                </div>
              )}
              <div
                key={pageIndex}
                className="image-share-preview"
                aria-busy={working}
              >
                {activePage ? (
                  <img src={activePage.url} alt="BD长图预览" />
                ) : (
                  <p>{busy ? message : "生成后可在这里预览完整长图。"}</p>
                )}
              </div>
              <p className="image-share-status" role="status">
                {message}
              </p>
              {error && (
                <p className="image-share-error" role="alert">
                  {error}
                </p>
              )}
              <div className="image-share-actions">
                <button disabled={working} onClick={() => void generate()}>
                  {busy ? "正在生成…" : image ? "重新生成" : "生成长图"}
                </button>
                <button
                  className="primary"
                  disabled={!activePage || working}
                  onClick={() => {
                    if (activePage) {
                      downloadPng(activePage.blob, partFilename);
                      setMessage("已发起 PNG 下载，请在浏览器下载列表中查看。");
                    }
                  }}
                >
                  {image && image.pages.length > 1
                    ? "下载当前 PNG"
                    : "下载 PNG"}
                </button>
                {image && image.pages.length > 1 && (
                  <button
                    className="primary"
                    disabled={working}
                    onClick={() => void downloadAll()}
                  >
                    {packing ? "正在打包…" : "打包下载全部 PNG"}
                  </button>
                )}
                {canShare && (
                  <button disabled={working} onClick={() => void share()}>
                    {image && image.pages.length > 1
                      ? "分享当前图片"
                      : "系统分享"}
                  </button>
                )}
              </div>
            </dialog>
            {data && (
              <div
                ref={sheet}
                className="image-export-stage"
                aria-hidden="true"
                inert
              >
                <BuildImageSheet
                  build={snapshot}
                  catalog={catalog}
                  data={data}
                  description={description}
                />
              </div>
            )}
          </>,
          document.body,
        )}
    </>
  );
}
