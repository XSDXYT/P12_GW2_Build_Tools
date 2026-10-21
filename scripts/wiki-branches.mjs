import { parseWikiPage } from "./wiki-details.mjs";

/** Linked tooltips are separate effects, never appended to the parent's facts. */
export async function attachWikiBranches({
  snapshot,
  config,
  api,
  manifest,
  readArticle,
  reviews,
}) {
  const names = Object.entries(api.en).map(([id, e]) => [
    e.name,
    api.zh[id]?.name || e.name,
  ]);
  const parsedPages = new Map();
  const audit = { parents: {}, pages: {}, issues: config.issues };
  for (const [id, parent] of Object.entries(config.parents)) {
    const entry = snapshot.entries.skills[id];
    if (!entry?.identityVerified)
      throw Error(`Unverified Wiki branch parent: ${id}`);
    if (entry.revision !== parent.revision)
      throw Error(`Review Wiki branch parent revision: ${id}`);
    for (const source of parent.sources) {
      const html = await readArticle(source.title);
      if (Number(html.match(/"wgRevisionId":(\d+)/)?.[1]) !== source.revision)
        throw Error(`Review Wiki branch index revision: ${source.title}`);
    }
    const branches = [];
    for (const link of parent.branches) {
      const page = config.pages[link.title],
        english = api.en[link.id],
        chinese = api.zh[link.id];
      if (!english || !chinese || page.id !== link.id)
        throw Error(`Missing branch API identity: ${link.title}`);
      let parsed = parsedPages.get(link.title);
      if (!parsed) {
        parsed = parseWikiPage(await readArticle(link.title), {
          kind: "skill",
          id: link.id,
          english,
          chinese,
          names,
          review: reviews?.entries.skills[link.id],
        });
        if (parsed.revision !== page.revision)
          throw Error(`Review Wiki branch revision: ${link.title}`);
        parsedPages.set(link.title, parsed);
        audit.pages[link.title] = {
          id: link.id,
          revision: parsed.revision,
          skipped: parsed.skipped,
          withheld: parsed.withheld,
          reviewedRows: parsed.reviewedRows,
          crossChecks: parsed.crossChecks,
        };
      }
      if (!parsed.rows.length) continue;
      branches.push({
        id: link.id,
        title: link.title,
        revision: parsed.revision,
        label: [link.audience, link.context, chinese.name]
          .filter(Boolean)
          .join(" · "),
        rows: parsed.rows,
        ...(link.requiresTrait ? { requiresTrait: link.requiresTrait } : {}),
      });
    }
    if (branches.length) entry.branches = branches;
    audit.parents[id] = {
      title: manifest.entries.skills[id].title,
      profession: parent.profession,
      branches: branches.length,
      sources: parent.sources,
    };
  }
  snapshot.branchCoverage = {
    parents: Object.values(audit.parents).filter((p) => p.branches).length,
    pages: parsedPages.size,
    branches: Object.values(audit.parents).reduce((s, p) => s + p.branches, 0),
    skippedRows: Object.values(audit.pages).reduce(
      (s, p) => s + p.skipped.length,
      0,
    ),
    withheldRows: Object.values(audit.pages).reduce(
      (s, p) => s + p.withheld.length,
      0,
    ),
  };
  return audit;
}
