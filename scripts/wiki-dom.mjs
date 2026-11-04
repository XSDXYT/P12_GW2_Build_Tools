/** Expansion badges can have a parser-output before the actual article. */
export function wikiContent($) {
  const main = $("#mw-content-text > .mw-parser-output").first();
  if (main.length) return main;
  const article = $(".mw-parser-output")
    .filter((_, node) => $(node).find(".infobox").length)
    .first();
  return article.length ? article : $(".mw-parser-output").last();
}
