import { load } from "cheerio";

const plain = (s) => s.replace(/\s+/g, " ").trim();
function currentEvidence(html) {
  const $ = load(html),
    q = $(".infobox").first().nextAll("blockquote").first();
  const current = q
    .add(q.nextUntil("h2:has(#Version_history),h2:has(#History)"))
    .clone();
  current
    .find(
      'script,style,[style*="display:none"],[style*="display: none"],.gamemode:not(.pve)',
    )
    .remove();
  return plain(current.text());
}
/** Only explicit current Wiki before/after tables; no API ordering or guessed percentages. */
export function rechargeTableRows(html) {
  const $ = load(html),
    content = $(".mw-parser-output").first().clone();
  const history = content
    .children("h2")
    .filter((_, e) => $(e).find("#Version_history,#History").length)
    .first();
  if (history.length) history.nextAll().add(history).remove();
  content
    .find(
      '.nav,.navbox,.toc,script,style,[style*="display:none"],[style*="display: none"]',
    )
    .remove();
  const rows = [];
  content.find("table").each((_, table) => {
    const headers = $(table)
      .find("tr")
      .first()
      .children("th")
      .map((_, h) => plain($(h).text()))
      .get()
      .filter(Boolean)
      .join(" ");
    if (!/^Skill\s+Traited recharge$/i.test(headers)) return;
    $(table)
      .find("tr")
      .slice(1)
      .each((_, tr) => {
        const cells = $(tr).children("td");
        if (cells.length < 2) return;
        if (
          $(tr)
            .add($(tr).parents())
            .filter(".gamemode")
            .toArray()
            .some((e) => !$(e).hasClass("pve"))
        )
          return;
        const text = plain($(tr).text());
        if (/PvP|WvW/.test(text) && !/PvE/.test(text)) return;
        // Conditional qualifiers other than explicit mode lists need a separate review.
        if (
          /\([^)]*\)/.test(
            text.replace(/\((?:PvE|PvP|WvW)(?:[, ]+(?:PvE|PvP|WvW))*\)/g, ""),
          )
        )
          return;
        const match = text.match(/([\d.]+)\s*→\s*([\d.]+)$/);
        if (!match) return;
        const titles = [
          ...new Set(
            cells
              .first()
              .find('a[href^="/wiki/"]')
              .toArray()
              .map((a) => decodeURIComponent($(a).attr("href").slice(6))),
          ),
        ];
        if (titles.length !== 1 || titles[0].includes("#")) return;
        rows.push({
          title: titles[0],
          text,
          before: Number(match[1]),
          after: Number(match[2]),
        });
      });
  });
  return rows;
}

export async function attachTraitModifiers({
  snapshot,
  config,
  readHtml,
  catalog,
}) {
  const audit = {
    rules: [],
    skipped: [],
    durations: [],
    professions: config.professions,
  };
  const targets = [];
  for (const [kind, entries] of Object.entries(snapshot.entries))
    for (const [id, entry] of Object.entries(entries)) {
      if (entry.identityVerified)
        targets.push({ kind, id: +id, entry, owner: entry });
      for (const branch of entry.branches || [])
        targets.push({
          kind: "skills",
          id: branch.id,
          entry: branch,
          owner: entry,
        });
    }
  const sources = new Map();
  async function source(kind, id, revision) {
    const key = `${kind}/${id}`;
    if (!sources.has(key)) sources.set(key, await readHtml(kind, id));
    const html = sources.get(key),
      actual = Number(html.match(/"wgRevisionId":(\d+)/)?.[1]);
    if (actual !== revision)
      throw Error(`Review trait modifier source revision: ${key}`);
    return html;
  }
  const add = (target, rule) => {
    if (target.entry.modifiers?.some((m) => m.id === rule.id)) return;
    const trait = catalog.traits.find((t) => t.id === rule.trait);
    const profession = catalog.specs.find(
      (s) => s.id === trait?.specialization,
    )?.profession;
    if (!trait || profession !== target.owner.profession)
      throw Error(
        `Trait modifier profession mismatch: ${rule.trait}/${target.id}`,
      );
    (target.entry.modifiers ??= []).push({ ...rule, traitName: trait.name });
    audit.rules.push({
      target: target.id,
      title: target.entry.title,
      trait: rule.trait,
      rule: rule.id,
      source: rule.source,
    });
  };
  // Explicit tables are reviewed per profession, then guarded against the
  // independent target page's current PvE cooldown before emitting a rule.
  for (const [traitId, traitPage] of Object.entries(snapshot.entries.traits)) {
    if (!config.professions.includes(traitPage.profession)) continue;
    const html = await source("traits", traitId, traitPage.revision);
    for (const row of rechargeTableRows(html)) {
      if (
        !Number.isFinite(row.before) ||
        !Number.isFinite(row.after) ||
        row.after <= 0 ||
        row.after >= row.before
      )
        continue;
      const matches = targets.filter(
        (t) =>
          t.kind === "skills" &&
          t.entry.title === row.title &&
          t.owner.profession === traitPage.profession,
      );
      if (!matches.length)
        audit.skipped.push({
          trait: +traitId,
          reason: "No independently verified skill page in snapshot",
          table: row,
        });
      for (const target of matches) {
        const cooldown = target.entry.rows.filter(
          (r) => r.label === "冷却时间",
        );
        if (
          cooldown.length !== 1 ||
          cooldown[0].detail !== `${row.before} 秒` ||
          target.entry.rows.some((r) =>
            /充能|弹药|最大计数|计数冷却|数量 冷却/.test(r.label),
          )
        ) {
          audit.skipped.push({
            trait: +traitId,
            target: target.id,
            reason: "Independent PvE cooldown or ammunition contract differs",
            table: row,
          });
          continue;
        }
        add(target, {
          id: `recharge-${traitId}-${target.id}`,
          trait: +traitId,
          priority: 0,
          source: {
            kind: "traits",
            id: +traitId,
            title: traitPage.title,
            revision: traitPage.revision,
          },
          changes: [
            {
              type: "number",
              label: "冷却时间",
              factor: row.after / row.before,
            },
          ],
        });
      }
    }
  }
  for (const definition of config.rules) {
    const traitPage = snapshot.entries.traits[definition.trait];
    if (!config.professions.includes(traitPage?.profession)) continue;
    const html = await source("traits", definition.trait, definition.revision);
    const evidence = currentEvidence(html);
    if (!evidence.includes(definition.evidence))
      throw Error(`Trait modifier evidence changed: ${definition.id}`);
    for (const extra of definition.evidenceSources || []) {
      const html = await source(extra.kind, extra.id, extra.revision);
      if (!currentEvidence(html).includes(extra.evidence))
        throw Error(
          `Additional trait evidence changed: ${definition.id}/${extra.id}`,
        );
    }
    for (const contract of definition.targets) {
      const matches = targets.filter(
        (t) => t.kind === contract.kind && t.id === contract.id,
      );
      if (!matches.length)
        throw Error(
          `Missing verified modifier target: ${definition.id}/${contract.id}`,
        );
      for (const target of matches) {
        if (target.entry.revision !== contract.revision)
          throw Error(
            `Review trait modifier target revision: ${definition.id}/${contract.id}`,
          );
        for (const guard of contract.guards || []) {
          if (
            !target.entry.rows.some(
              (r) => r.label === guard.label && r.detail === guard.detail,
            )
          )
            throw Error(
              `Trait modifier base changed: ${definition.id}/${contract.id}/${guard.label}`,
            );
        }
        const changes = contract.changes || definition.changes;
        for (const change of changes) {
          if (
            !["append", "replace", "duration", "number"].includes(change.type)
          )
            throw Error(`Unknown trait modifier: ${definition.id}`);
          if (
            change.type === "duration" &&
            (!Number.isFinite(change.factor) || change.factor <= 0)
          )
            throw Error(`Invalid duration factor: ${definition.id}`);
          const available = [
            ...target.entry.rows,
            ...(target.entry.modifiers || [])
              .filter((m) =>
                (definition.requiresTraits || []).includes(m.trait),
              )
              .flatMap((m) =>
                m.changes.filter((c) => c.type === "append").map((c) => c.row),
              ),
          ];
          if (
            change.type !== "append" &&
            available.filter((r) => r.label === change.label).length !== 1
          )
            throw Error(
              `Ambiguous trait modifier row: ${definition.id}/${contract.id}/${change.label}`,
            );
          if (
            change.type === "duration" &&
            !/^\d+(?:\.\d+)? 秒(?:$| ·)/.test(
              target.entry.rows.find((r) => r.label === change.label)?.detail ||
                "",
            )
          )
            throw Error("Unsupported duration modifier");
          if (
            change.type === "number" &&
            (!/^-?\d+(?:\.\d+)?(?:$| 秒|%| ·)/.test(
              target.entry.rows.find((r) => r.label === change.label)?.detail ||
                "",
            ) ||
              !Number.isFinite(change.factor ?? 1) ||
              !Number.isFinite(change.add ?? 0) ||
              (change.factor ?? 1) <= 0)
          )
            throw Error(`Unsupported numeric modifier: ${definition.id}`);
        }
        for (const id of definition.requiresTraits || []) {
          const required = snapshot.entries.traits[id];
          if (!required || required.profession !== traitPage.profession)
            throw Error(`Invalid trait combination: ${definition.id}`);
        }
        add(target, {
          id: definition.id,
          trait: definition.trait,
          requiresTraits: definition.requiresTraits,
          priority: definition.priority || 0,
          source: {
            kind: "traits",
            id: definition.trait,
            title: traitPage.title,
            revision: definition.revision,
          },
          changes,
        });
      }
    }
  }
  audit.skipped.push(...(config.reviewedExclusions || []));
  snapshot.traitDurationBonuses = [];
  for (const definition of config.durationBonuses || []) {
    const page = snapshot.entries.traits[definition.trait];
    if (!config.professions.includes(page?.profession)) continue;
    const html = await source("traits", definition.trait, definition.revision),
      $ = load(html);
    const quote = $(".infobox.trait")
      .first()
      .nextAll("blockquote")
      .first()
      .clone();
    quote
      .find(
        '.gamemode:not(.pve),script,style,[style*="display:none"],[style*="display: none"]',
      )
      .remove();
    if (
      !plain(quote.text()).includes(definition.evidence) ||
      !page.rows.some(
        (r) =>
          r.label === definition.guard.label &&
          r.detail === definition.guard.detail,
      )
    )
      throw Error(`Trait duration evidence changed: ${definition.trait}`);
    if (
      !definition.effects.length ||
      definition.effects.some(
        (e) =>
          ![
            "Bleeding",
            "Burning",
            "Poison",
            "Confusion",
            "Torment",
            "Vulnerability",
            "Chilled",
            "Fear",
          ].includes(e),
      ) ||
      !Number.isFinite(definition.bonus) ||
      definition.bonus <= 0 ||
      (definition.gate && !["fury"].includes(definition.gate))
    )
      throw Error(`Unsupported trait duration: ${definition.trait}`);
    const rule = {
      trait: definition.trait,
      name: catalog.traits.find((t) => t.id === definition.trait).name,
      effects: definition.effects,
      bonus: definition.bonus,
      ...(definition.gate ? { gate: definition.gate } : {}),
      source: { title: page.title, revision: definition.revision },
    };
    snapshot.traitDurationBonuses.push(rule);
    audit.durations.push(rule);
  }
  snapshot.modifierCoverage = {
    professions: config.professions,
    rules: audit.rules.length,
    targets: new Set(audit.rules.map((r) => `${r.target}/${r.title}`)).size,
    traits: new Set([...audit.rules, ...audit.durations].map((r) => r.trait))
      .size,
    durationTraits: audit.durations.length,
    guardedSkips: audit.skipped.length,
  };
  return audit;
}
