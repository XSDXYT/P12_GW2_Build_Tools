import { readFile } from "node:fs/promises";
import { parseWikiPage } from "./wiki-details.mjs";
import { load } from "cheerio";
const root = new URL("../", import.meta.url),
  file = (p) => new URL(p, root);
const config = JSON.parse(
  await readFile(file("data/wiki-branches.json"), "utf8"),
);
const api = JSON.parse(
  await readFile(file("data/wiki-branch-api.json"), "utf8"),
);
const reviews = JSON.parse(
  await readFile(file("data/wiki-reviews.json"), "utf8"),
);
const manifest = JSON.parse(
  await readFile(file("data/wiki-pages.json"), "utf8"),
);
const names = Object.entries(api.en).map(([id, e]) => [
  e.name,
  api.zh[id]?.name || e.name,
]);
const titles = [
  ...new Set(
    Object.values(config.parents).flatMap((p) =>
      p.branches.map((b) => b.title),
    ),
  ),
];
for (const title of titles) {
  const id = config.pages[title].id;
  if (!api.en[id] || !api.zh[id]) continue;
  let html;
  try {
    html = await readFile(
      file(`data/wiki-cache/articles/${encodeURIComponent(title)}.html`),
      "utf8",
    );
  } catch {
    const original = Object.entries(manifest.entries.skills).find(
      ([, e]) => e.title === title,
    );
    html = await readFile(
      file(`data/wiki-cache/skills-${original[0]}.html`),
      "utf8",
    );
  }
  try {
    const p = parseWikiPage(html, {
      kind: "skill",
      id,
      english: api.en[id],
      chinese: api.zh[id],
      names,
      review: reviews.entries.skills[id],
    });
    if (p.skipped.length || p.withheld.length) {
      const $ = load(html);
      console.log(
        JSON.stringify({
          id,
          title,
          revision: p.revision,
          skipped: p.skipped,
          withheld: p.withheld,
          annotations: $(".infobox.skill")
            .first()
            .nextAll("blockquote")
            .first()
            .find("#sic [title],.sic [title]")
            .toArray()
            .map((n) => $(n).attr("title"))
            .filter((n) => n !== "wikipedia:sic"),
        }),
      );
    }
  } catch (e) {
    console.log(JSON.stringify({ id, title, error: e.message }));
  }
}
