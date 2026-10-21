import { readFile, writeFile, mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { load } from "cheerio";
const root = new URL("../", import.meta.url);
const file = (p) => new URL(p, root);
const mirror = "https://wiki.wishingstar.top";
const headers = {
  "User-Agent": "GW2-Build-Tools/0.3 (Wiki research; offline snapshots)",
};

export async function openResearch() {
  const manifest = JSON.parse(
    await readFile(file("data/wiki-pages.json"), "utf8"),
  );
  const paths = new Map(
    Object.entries(manifest.entries).flatMap(([k, es]) =>
      Object.entries(es).map(([id, e]) => [
        e.title,
        `data/wiki-cache/${k}-${id}.html`,
      ]),
    ),
  );
  await mkdir(file("data/wiki-cache/articles/"), { recursive: true });
  let checkedRobots = false;
  async function request(title) {
    if (
      !title ||
      /^(Special|File|Category|Template|User|Talk):/i.test(title) ||
      title.includes("#")
    )
      throw Error(`Not an ordinary article: ${title}`);
    if (!checkedRobots) {
      const r = await fetch(mirror + "/robots.txt", {
        headers,
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw Error(`robots HTTP ${r.status}`);
      const body = await r.text();
      if (
        !body.includes("User-agent:") ||
        /Disallow:\s*(?:\/\s*$|\/wiki\/\s*$)/im.test(body)
      )
        throw Error("Cannot verify article access rules");
      checkedRobots = true;
    }
    await delay(1500);
    const r = await fetch(mirror + "/wiki/" + encodeURIComponent(title), {
      headers,
      signal: AbortSignal.timeout(30000),
    });
    if (r.status === 404)
      return (await r.text()) + "\n<!--GW2_WIKI_HTTP_404-->";
    if (!r.ok)
      throw Error(
        `Stop: HTTP ${r.status}; Retry-After=${r.headers.get("retry-after") || "none"}; ${title}`,
      );
    const body = await r.text();
    if (!body.includes("mw-parser-output") || !body.includes("wgRevisionId"))
      throw Error(`Unexpected article body: ${title}`);
    return body;
  }
  const read = async (title) => {
    const path = `data/wiki-cache/articles/${encodeURIComponent(title)}.html`;
    for (const p of [path, paths.get(title)].filter(Boolean))
      try {
        return await readFile(file(p), "utf8");
      } catch {}
    const html = await request(title);
    await writeFile(file(path), html, "utf8");
    return html;
  };
  return { read, manifest };
}
export function articleLinks(html) {
  const $ = load(html);
  return [
    ...new Set(
      $('.mw-parser-output a[href^="/wiki/"]')
        .toArray()
        .map((n) =>
          decodeURIComponent($(n).attr("href").slice(6).split("#")[0]),
        )
        .filter(
          (t) => t && !/^(Special|File|Category|Template|User|Talk):/i.test(t),
        ),
    ),
  ];
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { read } = await openResearch();
  for (const title of process.argv.slice(2)) {
    const html = await read(title);
    const $ = load(html);
    console.log(
      JSON.stringify({
        title,
        canonical: html.match(/"wgPageName":"([^"]+)"/)?.[1],
        revision: html.match(/"wgRevisionId":(\d+)/)?.[1],
        missing: html.includes("GW2_WIKI_HTTP_404"),
        links: articleLinks(html).length,
      }),
    );
  }
}
