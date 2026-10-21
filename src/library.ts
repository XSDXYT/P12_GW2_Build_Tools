import { z } from "zod";
import { buildSchema, type Build } from "./domain";
import { matchesBuild } from "./build-classification";

export const metadataSchema = z
  .object({
    favorite: z.boolean(),
    tags: z.array(z.string().trim().min(1).max(24)).max(8),
  })
  .strict();
export type BuildMetadata = z.infer<typeof metadataSchema>;
export type LibraryMetadata = Record<string, BuildMetadata>;
export const emptyMetadata = (): BuildMetadata => ({
  favorite: false,
  tags: [],
});
export const buildMetadata = (
  metadata: LibraryMetadata,
  id: string,
): BuildMetadata =>
  Object.hasOwn(metadata, id) ? metadata[id] : emptyMetadata();
export const metadataFileSchema = z
  .object({
    version: z.literal(1),
    entries: z.record(z.string().max(80), metadataSchema),
  })
  .strict();
export const libraryBackupSchema = z
  .object({
    type: z.literal("p12-library"),
    version: z.literal(1),
    builds: z.array(buildSchema).max(1000),
    metadata: z.record(z.string().max(80), metadataSchema),
  })
  .strict();
export type LibraryBackup = z.infer<typeof libraryBackupSchema>;
export function parseTags(text: string): string[] {
  const tags = [
    ...new Set(
      text
        .split(/[,，;；\n]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
  if (tags.length > 8 || tags.some((t) => t.length > 24))
    throw Error("每个配装最多 8 个标签，每个标签最多 24 字。");
  return tags;
}
export function filterLibrary(
  builds: Build[],
  metadata: LibraryMetadata,
  filter: {
    query: string;
    profession: string;
    tag: string;
    favorites: boolean;
    instance?: string;
    boss?: string;
    encounterMode?: string;
  },
) {
  return builds.filter((b) => {
    const info = buildMetadata(metadata, b.id);
    return (
      (!filter.favorites || info.favorite) &&
      matchesBuild(
        b,
        { ...filter, instance: filter.instance || "", boss: filter.boss || "" },
        info.tags,
      )
    );
  });
}
export function createLibraryBackup(
  builds: Build[],
  metadata: LibraryMetadata,
): LibraryBackup {
  return libraryBackupSchema.parse({
    type: "p12-library",
    version: 1,
    builds,
    metadata: Object.fromEntries(
      builds
        .filter((b) => Object.hasOwn(metadata, b.id))
        .map((b) => [b.id, metadata[b.id]]),
    ),
  });
}
export function parseLibraryBackup(text: string): LibraryBackup {
  if (text.length > 8 * 1024 * 1024) throw Error("配装库备份不能超过 8 MB。");
  const backup = libraryBackupSchema.parse(JSON.parse(text));
  if (new Set(backup.builds.map((b) => b.id)).size !== backup.builds.length)
    throw Error("备份包含重复配装 ID。");
  return backup;
}
/** Import as independent records; preserve existing builds and keep metadata on the new IDs. */
export function mergeLibraryBackup(
  builds: Build[],
  metadata: LibraryMetadata,
  backup: LibraryBackup,
) {
  const ids = new Set(builds.map((b) => b.id));
  const imported = backup.builds.map((b) => {
    let id: string;
    do {
      id = crypto.randomUUID();
    } while (ids.has(id));
    ids.add(id);
    return { ...b, id };
  });
  return {
    builds: [...imported, ...builds],
    metadata: {
      ...metadata,
      ...Object.fromEntries(
        imported.map((b, i) => [
          b.id,
          buildMetadata(backup.metadata, backup.builds[i].id),
        ]),
      ),
    },
  };
}
