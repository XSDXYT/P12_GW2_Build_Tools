import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBuild, parseBuild, encodeShare, decodeShare } from "./domain.ts";
import {
  builtinMarkdownStyles,
  compileMarkdownStyle,
  stylePresentation,
  cssFilename,
} from "./markdown-style.ts";
import {
  classicDescriptionStyle,
  cssDefaultsSchema,
} from "./markdown-style.ts";
import { readCssDefaults } from "./markdown-style-files.ts";
import {
  readStyleDirectory,
  readStyleFile,
  writeStyleFile,
  removeStyleFile,
  type StyleDirectory,
  type StyleFile,
} from "./markdown-style-files.ts";

test("内置模板均为可编辑独立CSS；版本1可选快照在下载和分享中保留，旧BD不补字段", () => {
  const old = createBuild();
  assert.ok(
    !Object.hasOwn(parseBuild(JSON.stringify(old)), "descriptionStyle"),
  );
  for (const item of builtinMarkdownStyles) {
    const css = readFileSync(`public/markdown-styles/${item.file}`, "utf8");
    assert.ok(compileMarkdownStyle(css).includes(".md-content[data-md-style]"));
    const build = { ...old, descriptionStyle: { name: item.name, css } };
    assert.deepEqual(parseBuild(JSON.stringify(build)), build);
    assert.deepEqual(decodeShare(encodeShare(build)), build);
    assert.ok(
      stylePresentation(build.descriptionStyle).css.includes("data-md-style="),
    );
  }
  assert.throws(() =>
    parseBuild(
      JSON.stringify({
        ...old,
        descriptionStyle: { name: "", css: "h2{color:red}" },
      }),
    ),
  );
  assert.throws(() =>
    parseBuild(
      JSON.stringify({
        ...old,
        descriptionStyle: { name: "大", css: "x".repeat(20001) },
      }),
    ),
  );
});

test("CSS逗号列表、根别名和媒体规则逐条限定在讲解正文，不能提升为全局选择器", () => {
  const css = compileMarkdownStyle(
    "h1,body,.build-reference{color:red}.markdown-body:hover{color:blue}@media(max-width:600px){:root>h2{font-size:18px}}",
    ".md-content[data-md-style=test]",
  );
  assert.match(
    css,
    /\.md-content\[data-md-style=test\] h1,\.md-content\[data-md-style=test\] body/,
  );
  assert.match(css, /\.md-content\[data-md-style=test\]:hover/);
  assert.match(css, /@media/);
  assert.throws(
    () => compileMarkdownStyle(".md-content + button {color:red}"),
    /兄弟选择器/,
  );
  assert.throws(
    () => compileMarkdownStyle(".md-content:hover ~ * {display:none}"),
    /兄弟选择器/,
  );
});

test("外部资源、字体、未知函数、定位、CSS嵌套和畸形CSS被拦截，危险快照不能导入BD", () => {
  for (const css of [
    "@import 'https://example.invalid/x.css';h2{color:red}",
    "h2{background:url(https://example.invalid/x.png)}",
    "h2{--md-image:url(https://example.invalid/x.png);color:red}",
    "@font-face{font-family:x;src:url(x)}h2{color:red}",
    "h2{background:image-set('https://example.invalid/x.png' 1x)}",
    "h2{position:fixed}",
    "h2{color:var(--app-color)}",
    ".md-content{h2{color:red}}",
    "h2 { color: red; invalid:value; }",
    "h2 { @import 'x' }",
  ]) {
    assert.throws(() => compileMarkdownStyle(css), css);
    assert.throws(
      () =>
        parseBuild(
          JSON.stringify({
            ...createBuild(),
            descriptionStyle: { name: "无效", css },
          }),
        ),
      css,
    );
  }
});

function directory() {
  const files = new Map<string, string>([["我的模板.css", "h2{color:red}"]]);
  const handle = (name: string) => ({
    kind: "file" as const,
    name,
    getFile: async () => new File([files.get(name)!], name),
    createWritable: async () => ({
      write: async (content: string) => {
        files.set(name, content);
      },
      close: async () => {},
      abort: async () => {},
    }),
  });
  const dir: StyleDirectory = {
    kind: "directory",
    name: "css",
    async *values() {
      for (const name of files.keys()) yield handle(name);
    },
    getFileHandle: async (name, options) => {
      if (!files.has(name)) {
        if (!options?.create)
          throw new DOMException("missing", "NotFoundError");
        files.set(name, "");
      }
      return handle(name);
    },
    removeEntry: async (name) => {
      files.delete(name);
    },
  };
  return { files, dir };
}

test("模板文件夹跳过非CSS和无效CSS；新文件避免同名覆盖，更新原文件并检测外部修改", async () => {
  const { files, dir } = directory();
  files.set("bad.css", "body{background:url(x)}");
  files.set("note.txt", "private");
  const scan = await readStyleDirectory(dir);
  assert.equal(scan.files.length, 1);
  assert.deepEqual(scan.skipped, ["bad.css"]);
  const original = scan.files[0];
  const added = await writeStyleFile(dir, {
    name: "我的模板",
    css: "h2{color:blue}",
  });
  assert.equal(added.file, "我的模板 (2).css");
  assert.equal(files.get(original.file), original.css);
  const updated = await writeStyleFile(
    dir,
    { name: "改名", css: "h2{color:green}" },
    original,
  );
  assert.equal(updated.file, original.file);
  assert.equal(files.get(original.file), updated.css);
  files.set(original.file, "h2{color:orange}");
  await assert.rejects(
    writeStyleFile(dir, { name: "改名", css: "h2{color:black}" }, updated),
    /外部修改/,
  );
  await assert.rejects(removeStyleFile(dir, updated), /外部修改/);
  assert.equal(files.get(original.file), "h2{color:orange}");
  await removeStyleFile(dir, added);
  assert.ok(!files.has(added.file));
  assert.equal(files.get("note.txt"), "private");
});

test("CSS导入边界、Windows安全文件名与目录路径拒绝", async () => {
  assert.equal(cssFilename("CON"), "_CON.css");
  assert.equal(cssFilename("流派/自用.CSS"), "流派_自用.css");
  await assert.rejects(
    readStyleFile(new File(["h2{color:red}"], "x.txt")),
    /CSS文件/,
  );
  await assert.rejects(
    readStyleFile(new File(["x".repeat(80001)], "大.css")),
    /过大/,
  );
  const { dir } = directory();
  await assert.rejects(
    removeStyleFile(dir, {
      name: "x",
      css: "h2{color:red}",
      original: "h2{color:red}",
      file: "../x.css",
    } as StyleFile),
    /CSS文件/,
  );
});

test("经典样式可显式保存以退出默认继承，默认设置文件独立校验且不接受BD或外部CSS", async () => {
  const build = { ...createBuild(), descriptionStyle: classicDescriptionStyle };
  assert.deepEqual(decodeShare(encodeShare(build)), build);
  const settings = {
    kind: "p12-css-default",
    version: 1,
    style: { name: "默认蓝", css: ".md-content{color:#123456}" },
  };
  assert.deepEqual(cssDefaultsSchema.parse(settings), settings);
  assert.deepEqual(
    await readCssDefaults(new File([JSON.stringify(settings)], "默认.json")),
    settings.style,
  );
  await assert.rejects(
    readCssDefaults(new File([JSON.stringify(build)], "BD.json")),
  );
  await assert.rejects(
    readCssDefaults(
      new File(
        [
          JSON.stringify({
            ...settings,
            style: { name: "无效", css: "body{background:url(x)}" },
          }),
        ],
        "坏.json",
      ),
    ),
  );
  await assert.rejects(
    readCssDefaults(new File(["x".repeat(80001)], "大.json")),
    /80KB/,
  );
});
