/** A readable JSON filename shared by downloads and local folder saves. */
export function jsonFilename(title: string) {
  let stem = title
    .normalize("NFC")
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/gu, "_")
    .replace(/\.json$/iu, "")
    .slice(0, 80)
    .replace(/[\uD800-\uDBFF]$/u, "")
    .replace(/[. ]+$/u, "");
  if (!stem) stem = "未命名配装";
  if (
    /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)(\.|$)/iu.test(
      stem,
    )
  )
    stem = `_${stem}`;
  return `${stem}.json`;
}
