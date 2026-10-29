import { jsonFilename } from "./build-filename";
import { zipSync } from "fflate";

export const imageSheetWidth = 1000;
const maxPixels = 16_000_000;
const maxSide = 16_384;
const maxPages = 20;
export function pngFilename(title: string) {
  return jsonFilename(title.replace(/\.png$/iu, "")).replace(
    /\.json$/iu,
    ".png",
  );
}
export function imageDimensions(width: number, height: number, scale: number) {
  if (
    ![width, height].every((v) => Number.isFinite(v) && v > 0) ||
    ![1, 2].includes(scale)
  )
    throw Error("无法读取长图尺寸，请重新生成。");
  const w = Math.ceil(width * scale),
    h = Math.ceil(height * scale);
  if (w > maxSide || h > maxSide || w * h > maxPixels)
    throw Error(
      "内容过长，超过长图尺寸上限。请改用标准清晰度，或取消附带 BD 讲解后重试。",
    );
  return { width: w, height: h };
}

/** Keep each canvas within its memory budget, with overlap for text at joins. */
export function imageSlices(width: number, height: number, scale: number) {
  // Validate width and scale without rejecting the full document height.
  const size = imageDimensions(width, 1, scale);
  if (!Number.isFinite(height) || height <= 0)
    throw Error("无法读取长图尺寸，请重新生成。");
  const limit = Math.floor(Math.min(maxSide, maxPixels / size.width) / scale);
  const total = Math.ceil(height);
  const slices: { y: number; height: number }[] = [];
  let y = 0;
  while (y < total) {
    if (slices.length >= maxPages)
      throw Error(
        "内容过长，分图数量超过20张。请改用标准清晰度，或取消附带 BD 讲解后重试。",
      );
    const h = Math.min(limit, total - y);
    slices.push({ y, height: h });
    if (y + h >= total) break;
    y += Math.max(1, h - 32);
  }
  return slices;
}

export function pngPartFilename(
  filename: string,
  index: number,
  count: number,
) {
  return count === 1
    ? filename
    : filename.replace(
        /\.png$/iu,
        `-${String(index + 1).padStart(2, "0")}.png`,
      );
}

export async function pngArchive(pages: { blob: Blob }[], filename: string) {
  const entries: Record<string, Uint8Array> = {};
  for (const [index, page] of pages.entries())
    entries[pngPartFilename(filename, index, pages.length)] = new Uint8Array(
      await page.blob.arrayBuffer(),
    );
  // PNG is already compressed; storing avoids costly recompression.
  return new Blob([new Uint8Array(zipSync(entries, { level: 0 }))], {
    type: "application/zip",
  });
}
const checkAbort = (signal: AbortSignal) => signal.throwIfAborted();

async function imageData(url: string, signal: AbortSignal): Promise<string> {
  const parsed = new URL(url, location.href);
  if (parsed.protocol === "data:") {
    if (
      !/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(url) ||
      url.length > 8_000_000
    )
      throw Error("Unsupported image");
    return url;
  }
  if (!["http:", "https:"].includes(parsed.protocol))
    throw Error("Unsupported image URL");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timer = window.setTimeout(cancel, 8000);
  try {
    checkAbort(signal);
    const response = await fetch(parsed, {
      signal: controller.signal,
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok || !response.body) throw Error("Image unavailable");
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 6_000_000) {
        await reader.cancel();
        throw Error("Image too large");
      }
      chunks.push(new Uint8Array(chunk.value));
    }
    const blob = new Blob(chunks, {
      type: response.headers.get("Content-Type") || "image/png",
    });
    if (!/^image\//i.test(blob.type)) throw Error("Not an image");
    return await new Promise((resolve, reject) => {
      const file = new FileReader();
      file.onload = () => resolve(String(file.result));
      file.onerror = () => reject(Error("Image unavailable"));
      file.readAsDataURL(blob);
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}

/** Only the isolated export sheet is modified. Failed CORS images retain text. */
async function inlineImages(
  node: HTMLElement,
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  const images = [...node.querySelectorAll("img")];
  const cache = new Map<string, Promise<string>>();
  const deadline = Date.now() + 15000;
  let processed = 0,
    next = 0,
    missing = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, images.length) }, async () => {
      while (next < images.length) {
        const img = images[next++];
        checkAbort(signal);
        try {
          if (Date.now() > deadline) throw Error("Image preparation deadline");
          const url = img.getAttribute("src") || "";
          if (!cache.has(url)) {
            if (cache.size >= 200) throw Error("Image limit");
            cache.set(url, imageData(url, signal));
          }
          img.src = await cache.get(url)!;
          await img.decode();
          // Oversized source images are omitted instead of allocating another giant canvas.
          if (img.naturalWidth * img.naturalHeight > 16_000_000)
            throw Error("Image dimensions too large");
        } catch {
          checkAbort(signal);
          missing++;
          const fallback = document.createElement("span");
          fallback.className =
            img.dataset.exportImage === "icon"
              ? "png-icon-fallback"
              : "png-image-fallback";
          fallback.textContent =
            img.dataset.exportImage === "icon" ? "" : img.alt || "图片";
          img.replaceWith(fallback);
        } finally {
          progress(`正在准备图标和图片… ${++processed}/${images.length}`);
        }
      }
    }),
  );
  return missing;
}

export async function captureBuildImage(
  node: HTMLElement,
  scale: number,
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  // Freeze a separate DOM snapshot: progress updates must never replace the
  // React-owned image nodes while cross-origin assets are being prepared.
  const host = document.createElement("div");
  host.className = "image-export-stage";
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  const copy = node.cloneNode(true) as HTMLElement;
  host.append(copy);
  document.body.append(host);
  try {
    progress("正在准备图标和图片…");
    const missing = await inlineImages(copy, signal, progress);
    await document.fonts.ready;
    checkAbort(signal);
    const rect = copy.getBoundingClientRect();
    const width = Math.ceil(rect.width),
      height = Math.ceil(rect.height);
    const slices = imageSlices(width, height, scale);
    const { default: html2canvas } = await import("html2canvas");
    const pages: { blob: Blob; width: number; height: number }[] = [];
    for (const [index, slice] of slices.entries()) {
      checkAbort(signal);
      progress(
        slices.length > 1
          ? `内容较长，正在绘制第 ${index + 1}/${slices.length} 张高清图…`
          : "正在绘制高清长图…",
      );
      const dimensions = imageDimensions(width, slice.height, scale);
      const canvas = await html2canvas(copy, {
        scale,
        width,
        height: slice.height,
        y: slice.y,
        windowWidth: 1200,
        windowHeight: 1200,
        scrollX: 0,
        scrollY: 0,
        backgroundColor: "#101b23",
        logging: false,
        imageTimeout: 8000,
        allowTaint: false,
      });
      try {
        checkAbort(signal);
        if (
          canvas.width !== dimensions.width ||
          canvas.height !== dimensions.height
        )
          throw Error("长图尺寸异常，请重试。");
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(Error("图片生成失败，请改用标准清晰度后重试。")),
            "image/png",
          ),
        );
        checkAbort(signal);
        pages.push({ blob, ...dimensions });
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    return { pages, missing };
  } finally {
    host.remove();
  }
}

export function downloadPng(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
