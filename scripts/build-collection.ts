import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
  rename,
  unlink,
  lstat,
} from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { parseBuild, type Build } from "../src/domain.ts";
import { collectionSchema, collectionMaxBytes } from "../src/collection.ts";

export async function buildCollection(root: string) {
  const source = path.resolve(root, "BD");
  const output = path.resolve(root, "public", "bd");
  for (const directory of [source, output]) {
    await mkdir(directory, { recursive: true });
    if ((await lstat(directory)).isSymbolicLink())
      throw Error(
        `BD collection directory cannot be a symbolic link: ${directory}`,
      );
  }
  const files = (await readdir(source, { withFileTypes: true }))
    .filter((entry) => entry.name.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (files.length > 1000) throw Error("BD collection exceeds 1000 files");
  const ids = new Set<string>();
  const builds: { build: Build; file: string; json: string }[] = [];
  for (const file of files) {
    if (!file.isFile())
      throw Error(`BD source must be a regular JSON file: ${file.name}`);
    const location = path.join(source, file.name);
    if ((await lstat(location)).size > 262144)
      throw Error(`BD file too large: ${file.name}`);
    let build: Build;
    try {
      build = parseBuild(await readFile(location, "utf8"));
    } catch {
      throw Error(
        `Invalid BD JSON: ${file.name}; existing generated collection retained`,
      );
    }
    if (ids.has(build.id))
      throw Error(
        `Duplicate BD id in ${file.name}; existing generated collection retained`,
      );
    ids.add(build.id);
    const json = JSON.stringify(build, null, 2) + "\n";
    const name = `bd-${createHash("sha256").update(json).digest("hex")}.json`;
    builds.push({ build, file: name, json });
  }
  const manifest = collectionSchema.parse({
    schema: 1,
    builds: builds.map(({ build, file }) => ({
      id: build.id,
      name: build.name,
      profession: build.profession,
      ...(build.tags ? { tags: build.tags } : {}),
      ...(build.encounters ? { encounters: build.encounters } : {}),
      file,
    })),
  });
  const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
  if (Buffer.byteLength(manifestJson, "utf8") > collectionMaxBytes)
    throw Error(
      "BD collection index exceeds 1 MB; existing generated collection retained",
    );
  // Validate every source before replacing any generated files. Content hashes
  // let readers of the previous manifest keep using its immutable files.
  for (const entry of builds)
    await writeFile(path.join(output, entry.file), entry.json);
  const temporary = path.join(output, "index.json.tmp");
  await writeFile(temporary, manifestJson);
  await rename(temporary, path.join(output, "index.json"));
  const keep = new Set(builds.map((build) => build.file));
  for (const file of await readdir(output))
    if (/^bd-[a-f0-9]{64}\.json$/.test(file) && !keep.has(file))
      await unlink(path.join(output, file));
  return manifest;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const manifest = await buildCollection(root);
  console.log(
    `BD collection generated: ${manifest.builds.length} builds from BD/`,
  );
}
