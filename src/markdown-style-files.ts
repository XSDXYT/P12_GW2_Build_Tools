import type { BuildDirectoryHandle } from "./build-files";
import {
  cssFilename,
  descriptionStyleSchema,
  type DescriptionStyle,
} from "./markdown-style";
import { cssDefaultsSchema } from "./markdown-style";
export type StyleDirectory = BuildDirectoryHandle & {
  removeEntry?: (name: string) => Promise<void>;
};
export type StyleFile = DescriptionStyle & { file: string; original: string };
function checkName(name: string) {
  if (!name || /[\\/]/.test(name) || !/\.css$/iu.test(name))
    throw Error("请选择CSS文件。");
}
export async function readStyleFile(file: File) {
  checkName(file.name);
  if (file.size > 80000) throw Error("CSS文件过大，最多20,000个字符。");
  const css = await file.text();
  const style = descriptionStyleSchema.parse({
    name: file.name.replace(/\.css$/iu, "").slice(0, 60),
    css,
  });
  return { ...style, file: file.name, original: css };
}
export async function readStyleDirectory(directory: StyleDirectory) {
  const files: StyleFile[] = [],
    skipped: string[] = [];
  let count = 0;
  for await (const entry of directory.values()) {
    if (entry.kind !== "file" || !/\.css$/iu.test(entry.name)) continue;
    if (++count > 100)
      throw Error("模板文件夹最多支持100个CSS文件，请拆分目录。");
    try {
      files.push(await readStyleFile(await entry.getFile()));
    } catch {
      skipped.push(entry.name);
    }
  }
  return { files, skipped };
}
async function verify(directory: StyleDirectory, file: StyleFile) {
  checkName(file.file);
  const handle = await directory.getFileHandle(file.file);
  const latest = await handle.getFile();
  if (latest.size > 80000 || (await latest.text()) !== file.original)
    throw Error("CSS文件已在外部修改，请先刷新模板文件夹；原文件未更改。");
  return handle;
}
export async function writeStyleFile(
  directory: StyleDirectory,
  style: DescriptionStyle,
  existing?: StyleFile,
) {
  const validated = descriptionStyleSchema.parse(style);
  let name = existing?.file || cssFilename(validated.name);
  let handle;
  if (existing) handle = await verify(directory, existing);
  else {
    const names = new Set<string>();
    for await (const entry of directory.values())
      names.add(entry.name.normalize("NFC").toLowerCase());
    const stem = name.slice(0, -4);
    for (let i = 1; names.has(name.normalize("NFC").toLowerCase()); i++) {
      if (i > 1000) throw Error("同名模板过多，请修改模板名称。");
      name = `${stem} (${i + 1}).css`;
    }
    handle = await directory.getFileHandle(name, { create: true });
  }
  const writer = await handle.createWritable();
  try {
    await writer.write(validated.css);
    await writer.close();
  } catch (error) {
    await writer.abort().catch(() => {});
    throw error;
  }
  return { ...validated, file: name, original: validated.css };
}
export async function removeStyleFile(
  directory: StyleDirectory,
  file: StyleFile,
) {
  if (!directory.removeEntry)
    throw Error("当前浏览器不支持删除文件，可在系统文件夹中删除后刷新。");
  await verify(directory, file);
  await directory.removeEntry(file.file);
}
export function downloadStyle(style: DescriptionStyle) {
  const validated = descriptionStyleSchema.parse(style);
  const url = URL.createObjectURL(
    new Blob([validated.css], { type: "text/css;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = cssFilename(validated.name);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function downloadCssDefaults(style?: DescriptionStyle) {
  const data = cssDefaultsSchema.parse({
    kind: "p12-css-default",
    version: 1,
    style: style || null,
  });
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "P12-CSS默认设置.json";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function readCssDefaults(file: File) {
  if (!/\.json$/iu.test(file.name) || file.size > 80000)
    throw Error("请选择不超过80KB的默认CSS设置JSON。");
  return (
    cssDefaultsSchema.parse(JSON.parse(await file.text())).style || undefined
  );
}
