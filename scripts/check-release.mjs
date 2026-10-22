import { execFileSync } from "node:child_process";
const files = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
if (!files.length)
  throw Error("No staged/tracked release files. Stage the source first.");
const forbidden = files.filter((path) =>
  /(^|\/)(docs|node_modules|dist|test-results|playwright-report|wiki-cache|wiki-consumable-cache|weapon-skill-cache)(\/|$)|\.md$|(^|\/)\.env(?:\.|$)|\.tmp$/i.test(
    path,
  ),
);
if (forbidden.length)
  throw Error(
    `Private documentation or local artifacts must not be published:\n${forbidden.join("\n")}`,
  );
console.log(
  `Release file check passed: ${files.length} source files; project documentation and local artifacts excluded.`,
);
