import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pagesScope, successfulBaseline } from "./pages-scope.mjs";

function fixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "p12-pages-scope-"));
  t.after(() => {
    assert.equal(path.dirname(cwd), path.resolve(tmpdir()));
    assert.ok(path.basename(cwd).startsWith("p12-pages-scope-"));
    rmSync(cwd, { recursive: true, force: true });
  });
  const git = (...args) =>
    execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Scope test");
  git("config", "user.email", "test@example.invalid");
  git("config", "core.autocrlf", "false");
  const save = (file, value = "{}") => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), value);
  };
  const commit = () => {
    git("add", "--all");
    git("commit", "--allow-empty", "-m", "fixture");
    return git("rev-parse", "HEAD");
  };
  save("BD/原始.json");
  save("src/app.ts", "original");
  const before = commit();
  const scope = (after, extra = {}) =>
    pagesScope({
      eventName: "push",
      cwd,
      before,
      after,
      validatedSha: before,
      ...extra,
    });
  return { cwd, git, save, commit, before, scope };
}

test("多次BD提交、中文空格文件名、大写扩展名及删除最后一个BD可快速发布", (t) => {
  const f = fixture(t);
  f.save("BD/中文 配装.JSON");
  f.commit();
  f.save("BD/原始.json", '{"updated":true}');
  assert.equal(f.scope(f.commit()).bdOnly, true);
  f.git("rm", "BD/原始.json", "BD/中文 配装.JSON");
  assert.equal(f.scope(f.commit()).bdOnly, true);
});
test("源码中间提交即使被撤销，也不能被最终BD差异掩盖", (t) => {
  const f = fixture(t);
  f.save("src/app.ts", "changed");
  f.commit();
  f.save("src/app.ts", "original");
  f.commit();
  f.save("BD/new.json");
  const after = f.commit();
  assert.equal(f.git("diff", "--name-only", f.before, after), "BD/new.json");
  assert.equal(f.scope(after).bdOnly, false);
});
test("工作流、锁文件、子目录、非JSON及重命名到目录外均走完整检查", (t) => {
  const f = fixture(t);
  for (const file of [
    ".github/workflows/pages.yml",
    "package-lock.json",
    "BD/private/notes.json",
    "BD/readme.txt",
  ]) {
    f.save(file);
    assert.equal(f.scope(f.commit()).bdOnly, false);
    f.git("reset", "--hard", f.before);
  }
  renameSync(
    path.join(f.cwd, "BD/原始.json"),
    path.join(f.cwd, "outside.json"),
  );
  assert.equal(f.scope(f.commit()).bdOnly, false);
});
test("手动运行、PR、零SHA、缺失历史、空提交及checkout不符均不能快速发布", (t) => {
  const f = fixture(t);
  const empty = f.commit();
  assert.equal(f.scope(empty).bdOnly, false);
  f.save("BD/new.json");
  const after = f.commit();
  for (const extra of [
    { eventName: "workflow_dispatch" },
    { eventName: "pull_request" },
    { before: "0".repeat(40) },
    { before: "f".repeat(40) },
    { before: "invalid" },
    { after: f.before },
    { validatedSha: undefined },
    { validatedSha: "f".repeat(40) },
  ])
    assert.equal(f.scope(after, extra).bdOnly, false);
});
test("合并含源码的分支或非快进推送不能快速发布", (t) => {
  const f = fixture(t);
  f.git("checkout", "-b", "feature");
  f.save("src/other.ts", "feature");
  const branch = f.commit();
  f.git("checkout", "main");
  f.save("BD/new.json");
  f.commit();
  f.git("merge", "--no-ff", "feature", "-m", "merge");
  const merged = f.git("rev-parse", "HEAD");
  assert.equal(f.scope(merged).bdOnly, false);
  f.git("reset", "--hard", f.before);
  f.save("BD/different.json");
  const after = f.commit();
  assert.equal(f.scope(after, { before: branch }).bdOnly, false);
});
test("功能部署未完成就追加BD提交，仍必须完整检查；已成功部署后方可快速检查", (t) => {
  const f = fixture(t);
  f.save("src/app.ts", "not deployed");
  const source = f.commit();
  f.save("BD/next.json");
  const after = f.commit();
  assert.equal(
    f.scope(after, { before: source, validatedSha: f.before }).bdOnly,
    false,
  );
  assert.equal(
    f.scope(after, { before: source, validatedSha: source }).bdOnly,
    true,
  );
});
test("只信任同仓库同分支已成功完成的push或手动部署，API缺失及PR不能提供基线", () => {
  const valid = {
    status: "completed",
    conclusion: "success",
    event: "push",
    head_branch: "main",
    head_repository: { full_name: "owner/repo" },
    head_sha: "a".repeat(40),
  };
  const invalid = [
    { ...valid, status: "in_progress" },
    { ...valid, conclusion: "cancelled" },
    { ...valid, event: "pull_request" },
    { ...valid, head_branch: "feature" },
    { ...valid, head_repository: { full_name: "other/repo" } },
    { ...valid, head_sha: "invalid" },
  ];
  assert.equal(successfulBaseline(invalid, "owner/repo", "main"), undefined);
  assert.equal(
    successfulBaseline([...invalid, valid], "owner/repo", "main"),
    valid.head_sha,
  );
  assert.equal(successfulBaseline(null, "owner/repo", "main"), undefined);
  assert.equal(successfulBaseline([null], "owner/repo", "main"), undefined);
});

test("Actions入口缺少可验证基线或事件为空时输出完整检查，不联网或崩溃", (t) => {
  const f = fixture(t);
  const event = path.join(f.cwd, "event.json"),
    output = path.join(f.cwd, "output.txt");
  writeFileSync(event, "null");
  const stdout = execFileSync(
    process.execPath,
    [fileURLToPath(new URL("./pages-scope.mjs", import.meta.url))],
    {
      cwd: f.cwd,
      windowsHide: true,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_TOKEN: "",
        GITHUB_REPOSITORY: "",
        GITHUB_EVENT_NAME: "push",
        GITHUB_EVENT_PATH: event,
        GITHUB_SHA: f.before,
        GITHUB_OUTPUT: output,
      },
    },
  );
  assert.match(stdout, /Full validation:/);
  assert.equal(readFileSync(output, "utf8"), "bd_only=false\n");
});
