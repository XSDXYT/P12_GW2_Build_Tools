import { parseBuild, type Build } from "./domain";
import { jsonFilename } from "./build-filename";
export interface BuildFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}
export interface BuildDirectoryHandle {
  kind: "directory";
  name: string;
  values(): AsyncIterable<
    BuildFileHandle | { kind: "directory"; name: string }
  >;
  getFileHandle(
    name: string,
    options?: { create: boolean },
  ): Promise<BuildFileHandle>;
}
declare global {
  interface Window {
    showDirectoryPicker?: (options: {
      id: string;
      mode: "readwrite";
    }) => Promise<BuildDirectoryHandle>;
  }
}
export function buildFilename(build: Build): string {
  return jsonFilename(build.name);
}
export async function readBuildDirectory(directory: BuildDirectoryHandle) {
  const builds: Build[] = [];
  const filenames = new Map<string, string>();
  const skipped: string[] = [];
  let count = 0;
  for await (const handle of directory.values()) {
    if (handle.kind !== "file" || !handle.name.toLowerCase().endsWith(".json"))
      continue;
    if (++count > 1000)
      throw Error("文件夹最多支持 1000 个 JSON 文件，请拆分目录。");
    try {
      const file = await handle.getFile();
      if (file.size > 262144) throw Error("文件过大");
      const build = parseBuild(await file.text());
      if (filenames.has(build.id)) throw Error("重复 ID");
      builds.push(build);
      filenames.set(build.id, handle.name);
    } catch {
      skipped.push(handle.name);
    }
  }
  return { builds, filenames, skipped };
}
export async function writeBuildFile(
  directory: BuildDirectoryHandle,
  build: Build,
  existingName?: string,
) {
  const validated = parseBuild(JSON.stringify(build));
  const base = buildFilename(validated).slice(0, -5);
  const entries = new Map<string, { kind: string; name: string }>();
  if (!existingName)
    for await (const entry of directory.values())
      entries.set(entry.name.normalize("NFC").toLowerCase(), entry);
  let name = existingName || `${base}.json`;
  if (!name || /[\\/]/.test(name) || !name.toLowerCase().endsWith(".json"))
    throw Error("无效 BD 文件名。");
  let handle: BuildFileHandle | undefined;
  for (let index = 1; index <= 1001; index++) {
    if (!existingName) {
      const candidate = `${base}${index > 1 ? ` (${index})` : ""}.json`;
      const entry = entries.get(candidate.normalize("NFC").toLowerCase());
      if (entry?.kind === "directory") continue;
      name = entry?.name || candidate;
    }
    try {
      const candidate = await directory.getFileHandle(name);
      const file = await candidate.getFile();
      let sameBuild = false;
      if (file.size <= 262144) {
        const raw = await file.text();
        try {
          sameBuild = parseBuild(raw).id === validated.id;
        } catch {
          // An unrelated or malformed JSON file must never be overwritten.
        }
      }
      if (sameBuild) {
        handle = candidate;
        break;
      }
      if (existingName) throw Error("同名文件属于其他 BD，未覆盖。");
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError")
        throw error;
      handle = await directory.getFileHandle(name, { create: true });
      break;
    }
  }
  if (!handle) throw Error("同名文件过多，请修改 BD 标题后重试。");
  const writer = await handle.createWritable();
  try {
    await writer.write(JSON.stringify(validated, null, 2) + "\n");
    await writer.close();
  } catch (error) {
    try {
      await writer.abort();
    } catch {
      /* Keep the original write error. */
    }
    throw error;
  }
  return name;
}
