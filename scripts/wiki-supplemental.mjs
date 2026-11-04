import { parseWikiPage } from "./wiki-details.mjs";
import { load } from "cheerio";

/** Independently verified weapon/mechanic pages, without inventing parent chains. */
export async function attachSupplementalWikiSkills({
  snapshot,
  config,
  api,
  readArticle,
  reviews,
}) {
  const audit = { pages: [], skipped: [], withheld: [] };
  const names = Object.entries(api.en).map(([id, entity]) => [
    entity.name,
    api.zh[id]?.name || entity.name,
  ]);
  for (const page of config.pages) {
    if (!snapshot.professions.includes(page.profession))
      throw Error(`Unknown supplemental profession: ${page.title}`);
    const html = await readArticle(page.title);
    for (const id of page.ids) {
      const english = api.en[id],
        chinese = api.zh[id];
      if (!english || !chinese || english.id !== id || chinese.id !== id)
        throw Error(`Missing supplemental API identity: ${page.title}/${id}`);
      if (
        english.professions?.length &&
        !english.professions.includes(page.profession)
      )
        throw Error(`Supplemental profession mismatch: ${page.title}/${id}`);
      const parsed = parseWikiPage(html, {
        kind: "skill",
        id,
        english,
        chinese,
        names,
        review: reviews?.entries?.skills?.[id],
      });
      if (parsed.revision !== page.revision)
        throw Error(`Review supplemental revision: ${page.title}/${id}`);
      const existing = snapshot.entries.skills[id];
      if (existing?.identityVerified)
        throw Error(`Supplemental page duplicates verified skill: ${id}`);
      snapshot.entries.skills[id] = {
        title: page.title,
        profession: page.profession,
        identityVerified: true,
        supplemental: true,
        ...(page.actor ? { actor: page.actor } : {}),
        ...parsed,
      };
      if (page.controlAlternatives) {
        const $ = load(html);
        const quote = $(".infobox.skill")
          .first()
          .nextAll("blockquote")
          .first()
          .text()
          .replace(/\s+/g, " ");
        if (!page.controlEvidence || !quote.includes(page.controlEvidence))
          throw Error(`Alternative control evidence changed: ${page.title}`);
        const controls = page.controlAlternatives.map((label) => {
          const matches = parsed.rows.filter((r) => r.label === label);
          const seconds = Number(
            matches[0]?.detail.match(/^(\d+(?:\.\d+)?) 秒$/)?.[1],
          );
          if (
            matches.length !== 1 ||
            !Number.isFinite(seconds) ||
            !["昏迷", "晕眩"].includes(label)
          )
            throw Error(
              `Alternative control row changed: ${page.title}/${label}`,
            );
          return { label, seconds };
        });
        const defiance = parsed.rows.filter((r) => r.label === "蔑视伤害");
        if (
          controls.length !== 2 ||
          controls[0].seconds !== controls[1].seconds ||
          defiance.length !== 1 ||
          Number(defiance[0].detail) !== controls[0].seconds * 100
        )
          throw Error(`Alternative defiance contract changed: ${page.title}`);
        snapshot.entries.skills[id].controlRule = {
          title: page.title,
          revision: page.revision,
          control: controls[0],
          alternateControls: controls.slice(1),
          defiance: Number(defiance[0].detail),
        };
      }
      audit.pages.push({
        id,
        title: page.title,
        revision: parsed.revision,
        profession: page.profession,
      });
      audit.skipped.push(
        ...parsed.skipped.map((text) => ({ id, title: page.title, text })),
      );
      audit.withheld.push(
        ...parsed.withheld.map((row) => ({ id, title: page.title, ...row })),
      );
    }
  }
  snapshot.supplementalCoverage = {
    pages: config.pages.length,
    skills: audit.pages.length,
    skippedRows: audit.skipped.length,
    withheldRows: audit.withheld.length,
  };
  // Only a single, unqualified stun/daze whose independent Wiki defiance value
  // agrees with its duration. Mixed, per-pulse and fixed CC stay excluded.
  for (const entry of Object.values(snapshot.entries.skills)) {
    for (const target of [entry, ...(entry.branches || [])]) {
      if (target.controlRule) continue;
      const control = target.rows.filter((r) =>
        ["昏迷", "晕眩"].includes(r.label),
      );
      const defiance = target.rows.filter((r) => r.label === "蔑视伤害");
      if (
        control.length !== 1 ||
        defiance.length !== 1 ||
        control[0].trigger ||
        target.rows.some((r) =>
          /击倒|击退|击飞|拉拽|上浮|下沉|恐惧|嘲讽/.test(r.label),
        )
      )
        continue;
      const seconds = Number(
        control[0].detail.match(/^(\d+(?:\.\d+)?) 秒$/)?.[1],
      );
      const amount = Number(defiance[0].detail);
      if (!Number.isFinite(seconds) || seconds < 1 || amount !== seconds * 100)
        continue;
      target.controlRule = {
        title: target.title,
        revision: target.revision,
        control: { label: control[0].label, seconds },
        defiance: amount,
      };
    }
  }
  return audit;
}
