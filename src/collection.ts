import { z } from "zod";
import { parseBuild, buildTagsSchema, encountersSchema } from "./domain";
export const collectionMaxBytes = 1024 * 1024;
export const collectionSchema = z
  .object({
    schema: z.literal(1),
    builds: z
      .array(
        z
          .object({
            id: z.string().max(80),
            name: z.string().max(80),
            profession: z.string().max(30),
            tags: buildTagsSchema.optional(),
            encounters: encountersSchema.optional(),
            file: z.string().regex(/^bd-[a-f0-9]{64}\.json$/),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.builds.map((b) => b.id)).size !== value.builds.length)
      context.addIssue({ code: "custom", message: "展示库存在重复 ID" });
  });
export type PublishedCollection = z.infer<typeof collectionSchema>;
export async function readCollection(
  fetcher: typeof fetch = fetch,
): Promise<PublishedCollection> {
  const response = await fetcher("./bd/index.json", { cache: "no-store" });
  if (!response.ok) throw Error("BD 展示目录读取失败。");
  const text = await response.text();
  if (new TextEncoder().encode(text).length > collectionMaxBytes)
    throw Error("BD 展示目录过大。");
  return collectionSchema.parse(JSON.parse(text));
}
export async function readPublishedBuild(
  id: string,
  fetcher: typeof fetch = fetch,
) {
  const collection = await readCollection(fetcher);
  const entry = collection.builds.find((build) => build.id === id);
  if (!entry) throw Error("展示库中没有这个 BD，可能尚未同步或已移除。");
  const response = await fetcher(`./bd/${entry.file}`, { cache: "no-store" });
  if (!response.ok) throw Error("BD 文件读取失败。");
  const build = parseBuild(await response.text());
  if (
    build.id !== entry.id ||
    build.name !== entry.name ||
    build.profession !== entry.profession ||
    JSON.stringify(build.tags || []) !== JSON.stringify(entry.tags || []) ||
    JSON.stringify(build.encounters || []) !==
      JSON.stringify(entry.encounters || [])
  )
    throw Error("BD 文件与目录不一致，请刷新后重试。");
  return build;
}
