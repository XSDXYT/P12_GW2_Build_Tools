// Presentation-only icons from the existing official API cache; no network or game-rule changes.
import { readFile, writeFile } from "node:fs/promises";

const cached = JSON.parse(
  await readFile("data/attribute-items.en.json", "utf8"),
);
const catalog = JSON.parse(await readFile("public/catalog.json", "utf8"));
const available = new Map(cached.items.map((item) => [item.id, item.icon]));
const prefix = "https://render.guildwars2.com/file/";
const icons = Object.fromEntries(
  catalog.items.flatMap((item) => {
    const icon = available.get(item.id);
    return icon?.startsWith(prefix)
      ? [[item.id, icon.slice(prefix.length)]]
      : [];
  }),
);
await writeFile(
  "src/data/equipment-icons.json",
  JSON.stringify(
    {
      source: cached.source,
      fetchedAt: cached.fetchedAt,
      icons,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Equipment icons: ${Object.keys(icons).length} from the existing API cache.`,
);
