export function localizeConsumables(items, localization) {
  return items.map((item) => {
    const entry = localization.entries[String(item.id)];
    if (
      !entry ||
      item.type !== "Consumable" ||
      !["Food", "Utility"].includes(item.details?.type)
    )
      return item;
    return {
      ...item,
      name: entry.name,
      apiName: item.apiName || item.name,
      englishName: entry.englishName,
      nameSource: "wishingstarmoye",
    };
  });
}

// Table markup is presentation, while <br> and paragraph boundaries carry
// meaningful line breaks in Chinese skill descriptions. Never execute it.
export function descriptionText(value) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?\s*>|<\/p\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
      const value =
        code[0].toLowerCase() === "x"
          ? parseInt(code.slice(1), 16)
          : Number(code);
      return value > 0 &&
        value <= 0x10ffff &&
        !(value >= 0xd800 && value <= 0xdfff)
        ? String.fromCodePoint(value)
        : "";
    })
    .replaceAll("&nbsp;", " ")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .trim();
}

export function localizeGameDescriptions(entities, localization, kind) {
  if (!["traits", "skills"].includes(kind)) throw Error("未知描述类别");
  return entities.map((entity) => {
    const entry = localization.entries[kind][entity.id];
    // A missing or blank community translation keeps the existing API text.
    if (!entry?.description?.trim()) return entity;
    return {
      ...entity,
      apiDescription: entity.apiDescription ?? entity.description ?? "",
      description: entry.description,
      descriptionSource: "wishingstarmoye",
      descriptionSourceUrl: `${localization.sources[kind]}/${entry.databaseId}`,
    };
  });
}

export function descriptionLocalizationSummary(catalog, localization) {
  const summarize = (kind) => ({
    matched: catalog[kind].filter(
      (e) => e.descriptionSource === "wishingstarmoye",
    ).length,
    changed: catalog[kind].filter(
      (e) =>
        e.apiDescription != null &&
        descriptionText(e.apiDescription) !== descriptionText(e.description),
    ).length,
    missing: catalog[kind]
      .filter((e) => e.descriptionSource !== "wishingstarmoye")
      .map((e) => e.id),
  });
  return {
    sources: localization.sources,
    fetchedAt: localization.fetchedAt,
    // This declares the upstream metadata boundary, not a UI warning.
    mode: "unspecified",
    traits: summarize("traits"),
    skills: summarize("skills"),
  };
}
