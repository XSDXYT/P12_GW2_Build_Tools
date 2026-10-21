import { parseBuild, type Build } from "./domain";
import { jsonFilename } from "./build-filename";
import {
  metadataFileSchema,
  metadataSchema,
  mergeLibraryBackup,
  type BuildMetadata,
  type LibraryBackup,
  type LibraryMetadata,
} from "./library";
export const STORAGE_KEY = "p12.builds.v1";
export const METADATA_KEY = "p12.library-metadata.v1";
export function readLibraryMetadata(): LibraryMetadata {
  const raw = localStorage.getItem(METADATA_KEY);
  if (!raw) return {};
  return metadataFileSchema.parse(JSON.parse(raw)).entries;
}
export function saveBuildMetadata(
  id: string,
  value: BuildMetadata,
): LibraryMetadata {
  const entries = {
    ...readLibraryMetadata(),
    [id]: metadataSchema.parse(value),
  };
  localStorage.setItem(METADATA_KEY, JSON.stringify({ version: 1, entries }));
  return entries;
}
export function importLibraryBackup(backup: LibraryBackup) {
  const next = mergeLibraryBackup(readLibrary(), readLibraryMetadata(), backup);
  const previous = localStorage.getItem(METADATA_KEY);
  localStorage.setItem(
    METADATA_KEY,
    JSON.stringify({ version: 1, entries: next.metadata }),
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.builds));
  } catch (error) {
    // Build writes are atomic; restore metadata if their write fails.
    if (previous === null) localStorage.removeItem(METADATA_KEY);
    else localStorage.setItem(METADATA_KEY, previous);
    throw error;
  }
  return next;
}
export function readLibrary(): Build[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries))
    throw Error("本地配装库格式异常，原始记录已保留。");
  return entries.map((entry) => parseBuild(JSON.stringify(entry)));
}
export function saveBuild(build: Build) {
  const entries = [
    build,
    ...readLibrary().filter((entry) => entry.id !== build.id),
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  return entries;
}
export function deleteBuild(id: string) {
  const entries = readLibrary().filter((entry) => entry.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  return entries;
}
export function downloadBuild(build: Build) {
  downloadJson(build, build.name);
}
export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = jsonFilename(filename);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
