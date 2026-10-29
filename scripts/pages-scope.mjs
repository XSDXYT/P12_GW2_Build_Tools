import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sha = /^[a-f0-9]{40}$/i;
/** Only an entirely BD-only push may skip the full browser suite. Fail closed. */
export function pagesScope({
  eventName,
  before,
  after,
  validatedSha,
  cwd = process.cwd(),
}) {
  const full = (reason) => ({ bdOnly: false, reason });
  if (eventName !== "push")
    return full("Manual runs and pull requests use full validation");
  if (
    !sha.test(before || "") ||
    !sha.test(after || "") ||
    /^0+$/.test(before) ||
    /^0+$/.test(after)
  )
    return full("Missing push history or initial branch creation");
  if (!sha.test(validatedSha || "") || /^0+$/.test(validatedSha))
    return full("No verified successful deployment baseline");
  const git = (args) =>
    execFileSync("git", args, {
      cwd,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    if (git(["rev-parse", "HEAD"]).toString("utf8").trim() !== after)
      return full("Checkout does not match this push");
    git(["merge-base", "--is-ancestor", before, after]);
    git(["merge-base", "--is-ancestor", validatedSha, after]);
    const commits = git(["rev-list", `${validatedSha}..${after}`])
      .toString("utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    if (!commits.length) return full("No new commits");
    let changed = false;
    for (const commit of commits) {
      // Inspect every commit and every merge parent, not just the final tree:
      // a reverted source change must still trigger full validation.
      const files = git([
        "diff-tree",
        "--root",
        "-m",
        "--no-commit-id",
        "--name-only",
        "--no-renames",
        "-r",
        "-z",
        commit,
      ])
        .toString("utf8")
        .split("\0")
        .filter(Boolean);
      if (
        files.some(
          (file) => !/^BD\/[^/]+\.json$/i.test(file) || !file.startsWith("BD/"),
        )
      )
        return full(
          "Push includes source, configuration or other non-BD changes",
        );
      changed ||= files.length > 0;
    }
    return changed
      ? {
          bdOnly: true,
          reason: "Every changed path in this push is a top-level BD JSON",
        }
      : full("No changed files");
  } catch {
    return full("Push history cannot be verified");
  }
}

export function successfulBaseline(runs, repository, branch) {
  if (!Array.isArray(runs)) return;
  return runs.find(
    (run) =>
      run?.status === "completed" &&
      run.conclusion === "success" &&
      ["push", "workflow_dispatch"].includes(run.event) &&
      run.head_branch === branch &&
      run.head_repository?.full_name === repository &&
      sha.test(run.head_sha || ""),
  )?.head_sha;
}

async function deploymentBaseline() {
  const {
    GITHUB_REPOSITORY: repository,
    GITHUB_REF_NAME: branch,
    GITHUB_TOKEN: token,
  } = process.env;
  if (
    !repository ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    !branch ||
    !token
  )
    return;
  try {
    const url = new URL(
      `https://api.github.com/repos/${repository}/actions/workflows/pages.yml/runs`,
    );
    url.search = new URLSearchParams({
      branch,
      status: "success",
      per_page: "20",
    }).toString();
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "P12-Pages-Scope",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return;
    return successfulBaseline(
      (await response.json()).workflow_runs,
      repository,
      branch,
    );
  } catch {
    /* Offline, API limits or unknown history require full validation. */
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  let event = {};
  try {
    event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  } catch {
    /* Full validation without a usable event. */
  }
  const validatedSha =
    process.env.GITHUB_EVENT_NAME === "push"
      ? await deploymentBaseline()
      : undefined;
  const scope = pagesScope({
    eventName: process.env.GITHUB_EVENT_NAME,
    before: event?.before,
    after: process.env.GITHUB_SHA,
    validatedSha,
  });
  console.log(
    `${scope.bdOnly ? "BD-only" : "Full"} validation: ${scope.reason}`,
  );
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `bd_only=${scope.bdOnly}\n`);
}
