import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  reconcileStructure,
  validateStructure,
} from "./data-source-policy.mjs";

const root = new URL("../", import.meta.url);
export async function loadSourcePolicy() {
  const read = async (path) =>
    JSON.parse(await readFile(new URL(path, root), "utf8"));
  const [evidence, reviews, catalog] = await Promise.all([
    read("data/wiki-structure.json"),
    read("data/structure-reviews.json"),
    read("public/catalog.json"),
  ]);
  const revisions = await loadWikiRevisions(catalog.professions);
  validateStructure(evidence, revisions);
  return { evidence, reviews, revisions };
}

export async function loadWikiRevisions(professions) {
  const fragments = await Promise.all(
    professions.map(async (p) =>
      JSON.parse(
        await readFile(
          new URL(`src/data/wiki/${p.id.toLowerCase()}.json`, root),
          "utf8",
        ),
      ),
    ),
  );
  const revisions = { traits: {}, skills: {} };
  for (const fragment of fragments)
    for (const kind of ["traits", "skills"])
      Object.assign(revisions[kind], fragment.entries[kind]);
  return revisions;
}

export async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(value) + "\n");
  await rename(`${path}.tmp`, path);
}

export async function writeSourcedSnapshot(path, input, dataset, options = {}) {
  const policy = options.policy || (await loadSourcePolicy());
  const result = reconcileStructure(input, { ...policy, dataset });
  const auditPath = resolve(
    options.auditDirectory ||
      fileURLToPath(new URL("data/source-audit/", root)),
    `${dataset}.json`,
  );
  if (auditPath === resolve(path))
    throw Error("Audit and snapshot paths must differ");
  await atomicJson(auditPath, result.audit);
  if (result.audit.conflicts.length)
    throw Error(
      `Unreviewed Wiki/API structure conflicts; existing ${path} retained: ${result.audit.conflicts.join(", ")}`,
    );
  await atomicJson(path, result.output);
  return result;
}
