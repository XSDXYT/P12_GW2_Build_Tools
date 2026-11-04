import { join } from "node:path";
import { fileURLToPath } from "node:url";

const articles = fileURLToPath(
  new URL("../data/wiki-cache/articles/", import.meta.url),
);
// Keep the encoded title as a literal filename: a file URL would decode %3A
// back into ':' (an NTFS alternate-stream separator on Windows).
export const wikiArticlePath = (title) =>
  join(articles, `${encodeURIComponent(title)}.html`);
