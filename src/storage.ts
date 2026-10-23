import { parseBuild, type Build } from "./domain";
import { jsonFilename } from "./build-filename";
import { createLibraryBackup, metadataFileSchema } from "./library";
export const STORAGE_KEY = "p12.builds.v1";
export const METADATA_KEY = "p12.library-metadata.v1";
function readLibraryMetadata() {
  const raw = localStorage.getItem(METADATA_KEY);
  if (!raw) return {};
  return metadataFileSchema.parse(JSON.parse(raw)).entries;
}
// Read-only compatibility for users moving existing browser records to files.
export function readLegacyBackup() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries))
    throw Error("本地配装库格式异常，原始记录已保留。");
  const builds = entries.map((entry) => parseBuild(JSON.stringify(entry)));
  // Invalid personal metadata must not make valid builds inaccessible.
  let metadata = {};
  try {
    metadata = readLibraryMetadata();
  } catch {
    /* Leave the original metadata untouched. */
  }
  return createLibraryBackup(builds, metadata);
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
