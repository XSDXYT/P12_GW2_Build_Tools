import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBuild, parseBuild, encodeShare, decodeShare } from "./domain.ts";
import { jsonFilename } from "./build-filename.ts";
import { matchesBuild, groupBuilds } from "./build-classification.ts";
import {
  encounterCatalog,
  instanceOptions,
  bossOptions,
} from "./encounter-catalog.ts";
import {
  createLibraryBackup,
  parseLibraryBackup,
  filterLibrary,
} from "./library.ts";
import {
  collectionSchema,
  readCollection,
  readPublishedBuild,
} from "./collection.ts";
import { buildCollection } from "../scripts/build-collection.ts";
import {
  buildFilename,
  readBuildDirectory,
  readBuildFile,
  writeBuildFile,
  type BuildDirectoryHandle,
  type BuildFileHandle,
} from "./build-files.ts";

test("BD文件夹离线生成目录与独立JSON：空配置和Markdown保留，重复ID或坏文件不覆盖有效目录", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "p12-collection-"));
  try {
    await mkdir(path.join(root, "BD"));
    const build = {
      ...createBuild(),
      description: "# 测试\n[幻象回复](gw2:trait/1866)",
      tags: ["治疗", "开荒"],
      encounters: [
        { instance: "灵魂山谷", boss: "山谷守护者" },
        { instance: "赎罪堡垒" },
      ],
    };
    await writeFile(path.join(root, "BD", "my-bd.json"), JSON.stringify(build));
    const first = await buildCollection(root);
    assert.equal(first.builds.length, 1);
    assert.deepEqual(first.builds[0].tags, build.tags);
    assert.deepEqual(first.builds[0].encounters, build.encounters);
    assert.deepEqual(
      JSON.parse(
        await readFile(
          path.join(root, "public", "bd", first.builds[0].file),
          "utf8",
        ),
      ),
      build,
    );
    assert.deepEqual(await buildCollection(root), first);
    const manifest = await readFile(
      path.join(root, "public", "bd", "index.json"),
      "utf8",
    );
    await writeFile(
      path.join(root, "BD", "duplicate.json"),
      JSON.stringify(build),
    );
    await assert.rejects(buildCollection(root), /Duplicate/);
    assert.equal(
      await readFile(path.join(root, "public", "bd", "index.json"), "utf8"),
      manifest,
    );
    await writeFile(path.join(root, "BD", "duplicate.json"), "broken");
    await assert.rejects(buildCollection(root), /Invalid/);
    assert.equal(
      await readFile(path.join(root, "public", "bd", "index.json"), "utf8"),
      manifest,
    );
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith("p12-collection-"));
    await rm(root, { recursive: true, force: true });
  }
});

test("构筑标签与副本BOSS沿用版本1，保存分享备份保留，旧文件不补写；非法和超长分类拒绝", () => {
  const original = createBuild();
  assert.deepEqual(parseBuild(JSON.stringify(original)), original);
  const build = {
    ...original,
    tags: ["治疗", "增益"],
    encounters: [
      { instance: "灵魂山谷", boss: "山谷守护者" },
      { instance: "赎罪堡垒" },
    ],
  };
  assert.deepEqual(decodeShare(encodeShare(build)), build);
  assert.deepEqual(
    parseLibraryBackup(JSON.stringify(createLibraryBackup([build], {})))
      .builds[0],
    build,
  );
  assert.deepEqual(
    parseBuild(
      JSON.stringify({
        ...build,
        tags: [" 治疗 ", "治疗"],
        encounters: [build.encounters[0], build.encounters[0]],
      }),
    ),
    { ...build, tags: ["治疗"], encounters: [build.encounters[0]] },
  );
  for (const change of [
    { tags: ["x".repeat(25)] },
    { tags: Array(9).fill("a") },
    { encounters: [{ instance: " ", boss: "孤立BOSS" }] },
    { encounters: [{ instance: "副本", boss: "b".repeat(61) }] },
    { encounters: Array(21).fill({ instance: "副本" }) },
  ])
    assert.throws(() => parseBuild(JSON.stringify({ ...build, ...change })));
});

test("搜索和分组保留副本BOSS关联，跨副本同名BOSS可区分，多场景不重复计入同组", () => {
  const a = {
    ...createBuild("Mesmer"),
    name: "治疗幻术",
    tags: ["开荒"],
    encounters: [
      { instance: "副本甲", boss: "首领甲" },
      { instance: "副本乙", boss: "首领乙" },
    ],
  };
  const b = {
    ...createBuild("Guardian"),
    name: "同名首领",
    encounters: [{ instance: "副本乙", boss: "首领甲" }],
  };
  const old = createBuild("Warrior");
  const filter = { query: "", profession: "", tag: "", instance: "", boss: "" };
  assert.equal(matchesBuild(a, { ...filter, query: "幻术师 开荒" }), true);
  assert.equal(
    matchesBuild(a, { ...filter, instance: "副本甲", boss: "首领乙" }),
    false,
  );
  assert.equal(
    matchesBuild(b, { ...filter, instance: "副本甲", boss: "首领甲" }),
    false,
  );
  const groups = groupBuilds([a, b, old], "encounter", filter);
  assert.deepEqual(
    groups.map((g) => g.title),
    ["副本甲", "副本乙", "未分类"],
  );
  assert.equal(groups[1].children.length, 2);
  assert.equal(
    groupBuilds(
      [{ ...a, encounters: [...a.encounters, a.encounters[0]] }],
      "encounter",
      filter,
    )[0].children[0].builds.length,
    1,
  );
  assert.equal(groupBuilds([a, b, old], "profession", filter).length, 3);
  assert.deepEqual(
    filterLibrary(
      [a, b, old],
      {},
      { ...filter, favorites: false, tag: "开荒", query: "首领乙" },
    ),
    [a],
  );
  assert.deepEqual(
    filterLibrary(
      [a],
      { [a.id]: { favorite: true, tags: ["私用"] } },
      { ...filter, favorites: true, tag: "私用" },
    ),
    [a],
  );
  assert.deepEqual(a.tags, ["开荒"]);
});

test("公开目录中的分类与JSON不一致时拒绝加载，防止错误分组", async () => {
  const build = {
    ...createBuild(),
    tags: ["治疗"],
    encounters: [{ instance: "副本甲", boss: "首领甲" }],
  };
  const entry = {
    id: build.id,
    name: build.name,
    profession: build.profession,
    tags: build.tags,
    encounters: build.encounters,
    file: `bd-${"a".repeat(64)}.json`,
  };
  const fetcher =
    (data: unknown): typeof fetch =>
    async (input) =>
      new Response(
        JSON.stringify(
          String(input).endsWith("index.json")
            ? { schema: 1, builds: [entry] }
            : data,
        ),
      );
  assert.deepEqual(await readPublishedBuild(build.id, fetcher(build)), build);
  await assert.rejects(
    readPublishedBuild(build.id, fetcher({ ...build, tags: ["输出"] })),
    /不一致/,
  );
  await assert.rejects(
    readPublishedBuild(
      build.id,
      fetcher({
        ...build,
        encounters: [{ instance: "副本乙", boss: "首领甲" }],
      }),
    ),
    /不一致/,
  );
});

test("分类使公开索引超过读取上限时生成失败，旧目录和数据文件保留", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "p12-collection-"));
  try {
    await mkdir(path.join(root, "BD"));
    await writeFile(
      path.join(root, "BD", "original.json"),
      JSON.stringify(createBuild()),
    );
    const first = await buildCollection(root);
    const index = path.join(root, "public", "bd", "index.json");
    const before = await readFile(index, "utf8");
    await Promise.all(
      Array.from({ length: 150 }, (_, i) =>
        writeFile(
          path.join(root, "BD", `large-${i}.json`),
          JSON.stringify({
            ...createBuild(),
            encounters: Array.from({ length: 20 }, (_, j) => ({
              instance: "副".repeat(58) + j,
              boss: "首".repeat(60),
            })),
          }),
        ),
      ),
    );
    await assert.rejects(buildCollection(root), /index exceeds/);
    assert.equal(await readFile(index, "utf8"), before);
    assert.equal(
      JSON.parse(
        await readFile(
          path.join(root, "public", "bd", first.builds[0].file),
          "utf8",
        ),
      ).id,
      first.builds[0].id,
    );
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith("p12-collection-"));
    await rm(root, { recursive: true, force: true });
  }
});

test("内置副本与BOSS目录离线可用，别名解析和父副本约束不会串场景", () => {
  assert.equal(encounterCatalog.length, 54);
  assert.equal(
    new Set(encounterCatalog.map((e) => e.id)).size,
    encounterCatalog.length,
  );
  assert.equal(
    new Set(instanceOptions.map((e) => e.value)).size,
    encounterCatalog.length,
  );
  assert.deepEqual(bossOptions("W1"), bossOptions("灵魂山谷"));
  assert.equal(bossOptions("W1").length, 3);
  assert.ok(
    bossOptions("W1").some(
      (e) => e.value === "山谷守护者" && e.keywords?.includes("VG"),
    ),
  );
  assert.ok(!bossOptions("W1").some((e) => e.value.includes("戴莫斯")));
  assert.deepEqual(bossOptions("我的自定义副本"), []);
  assert.ok(bossOptions("").filter((e) => e.value === "塞鲁斯").length > 1);
});

test("同一BOSS的三种模式独立保存分享和筛选，旧场景不自动当作普通模式", () => {
  const base = createBuild();
  const scenes = [
    { instance: "菲勃神殿", boss: "塞鲁斯" },
    ...(["normal", "challenge", "legendary"] as const).map((mode) => ({
      instance: "菲勃神殿",
      boss: "塞鲁斯",
      mode,
    })),
  ];
  const build = parseBuild(
    JSON.stringify({ ...base, encounters: [...scenes, scenes[1]] }),
  );
  assert.deepEqual(build.encounters, scenes);
  assert.deepEqual(decodeShare(encodeShare(build)), build);
  const filter = {
    query: "",
    profession: "",
    tag: "",
    instance: "菲勃神殿",
    boss: "塞鲁斯",
    encounterMode: "legendary",
  };
  assert.equal(matchesBuild(build, filter), true);
  assert.equal(
    matchesBuild({ ...base, encounters: [scenes[0]] }, filter),
    false,
  );
  const groups = groupBuilds([build], "encounter", filter);
  assert.equal(groups[0].children.length, 1);
  assert.equal(groups[0].children[0].title, "塞鲁斯 · 传奇挑战");
  assert.equal(
    groupBuilds([build], "encounter", { instance: "", boss: "" })[0].children
      .length,
    4,
  );
  assert.throws(() =>
    parseBuild(
      JSON.stringify({
        ...base,
        encounters: [{ instance: "菲勃神殿", mode: "unknown" }],
      }),
    ),
  );
});

test("公开目录只读取同站受控JSON路径，身份不符和未知ID拒绝加载", async () => {
  const build = createBuild();
  const file = `bd-${"a".repeat(64)}.json`;
  const manifest = {
    schema: 1,
    builds: [
      { id: build.id, name: build.name, profession: build.profession, file },
    ],
  };
  const urls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    urls.push(String(input));
    return new Response(
      JSON.stringify(String(input).endsWith("index.json") ? manifest : build),
    );
  };
  assert.deepEqual(await readPublishedBuild(build.id, fetcher), build);
  assert.deepEqual(urls, ["./bd/index.json", `./bd/${file}`]);
  await assert.rejects(readPublishedBuild("missing", fetcher));
  assert.throws(() =>
    collectionSchema.parse({
      ...manifest,
      builds: [{ ...manifest.builds[0], file: "../../private.json" }],
    }),
  );
  const mismatch: typeof fetch = async (input) =>
    new Response(
      JSON.stringify(
        String(input).endsWith("index.json")
          ? manifest
          : { ...build, id: "other" },
      ),
    );
  await assert.rejects(readPublishedBuild(build.id, mismatch), /不一致/);
  await assert.rejects(
    readCollection(async () => new Response("missing", { status: 404 })),
  );
});

function memoryDirectory() {
  const data = new Map<string, string>();
  let fail = false,
    aborted = false;
  const handle = (name: string): BuildFileHandle => ({
    kind: "file",
    name,
    async getFile() {
      return new File([data.get(name) || ""], name);
    },
    async createWritable() {
      let pending = "";
      return {
        async write(value) {
          if (fail) throw Error("write failed");
          pending = value;
        },
        async close() {
          data.set(name, pending);
        },
        async abort() {
          aborted = true;
        },
      };
    },
  });
  const directory: BuildDirectoryHandle = {
    kind: "directory",
    name: "BD",
    async *values() {
      for (const name of data.keys()) yield handle(name);
    },
    async getFileHandle(name, options) {
      if (!data.has(name) && !options?.create)
        throw new DOMException("missing", "NotFoundError");
      if (!data.has(name)) data.set(name, "");
      return handle(name);
    },
  };
  return {
    data,
    directory,
    fail: () => {
      fail = true;
    },
    aborted: () => aborted,
  };
}
test("本地卡片重新读取实际文件，拒绝身份替换、超大/损坏文件和路径跳转", async () => {
  const store = memoryDirectory();
  const b = { ...createBuild(), description: "扫描时说明" };
  store.data.set("original.json", JSON.stringify(b));
  await readBuildDirectory(store.directory);
  const updated = { ...b, description: "磁盘最新说明" };
  store.data.set("original.json", JSON.stringify(updated));
  assert.deepEqual(
    await readBuildFile(store.directory, "original.json", b.id),
    updated,
  );
  store.data.set("original.json", JSON.stringify(createBuild()));
  await assert.rejects(
    readBuildFile(store.directory, "original.json", b.id),
    /身份已变化/,
  );
  store.data.set("original.json", " ".repeat(262145));
  await assert.rejects(
    readBuildFile(store.directory, "original.json", b.id),
    /过大/,
  );
  store.data.set("original.json", "broken");
  await assert.rejects(readBuildFile(store.directory, "original.json", b.id));
  store.data.delete("original.json");
  await assert.rejects(readBuildFile(store.directory, "original.json", b.id));
  await assert.rejects(
    readBuildFile(store.directory, "../elsewhere.json", b.id),
    /无效/,
  );
  assert.equal(store.data.size, 0);
});
test("本地新文件按标题命名，原文件名可沿用，写入失败或同名异ID不覆盖", async () => {
  const store = memoryDirectory();
  const build = { ...createBuild(), description: "本地说明" };
  const filename = await writeBuildFile(store.directory, build);
  assert.equal(filename, await buildFilename(build));
  const updated = { ...build, name: "新名字" };
  assert.equal(
    await writeBuildFile(store.directory, updated, filename),
    filename,
  );
  assert.deepEqual((await readBuildDirectory(store.directory)).builds, [
    updated,
  ]);
  const before = store.data.get(filename);
  await assert.rejects(
    writeBuildFile(store.directory, createBuild(), filename),
    /其他 BD/,
  );
  assert.equal(store.data.get(filename), before);
  store.fail();
  await assert.rejects(writeBuildFile(store.directory, build, filename));
  assert.equal(store.data.get(filename), before);
  assert.equal(store.aborted(), true);
  assert.equal(
    buildFilename({ ...build, id: "../../特殊路径" }),
    "未命名配装.json",
  );
});

test("标题文件名保留中文并处理Windows非法字符、设备名、尾部空点及长Unicode", () => {
  for (const [title, expected] of [
    [" 治疗幻术 · 开荒 ", "治疗幻术 · 开荒.json"],
    ['治疗/开荒\\甲:*?"<>|\u0000', "治疗_开荒_甲________.json"],
    ["治疗说明.json", "治疗说明.json"],
    ["尾部... ", "尾部.json"],
    [" . . ", "未命名配装.json"],
    ["CON", "_CON.json"],
    ["com1.txt", "_com1.txt.json"],
    ["LPT¹", "_LPT¹.json"],
  ])
    assert.equal(jsonFilename(title), expected, title);
  const long = jsonFilename("字".repeat(79) + "😀");
  assert.equal(long, "字".repeat(79) + ".json");
  assert.ok(new TextEncoder().encode(long).length < 256);
});

test("同标题新BD自动编号，保留其他BD、坏JSON与大小写冲突文件，同ID再次保存不另建文件", async () => {
  const store = memoryDirectory();
  const first = { ...createBuild(), name: "治疗幻术" };
  const second = { ...createBuild(), name: "治疗幻术" };
  store.data.set("治疗幻术 (2).json", "这是其他文件，不覆盖");
  assert.equal(await writeBuildFile(store.directory, first), "治疗幻术.json");
  assert.equal(
    await writeBuildFile(store.directory, second),
    "治疗幻术 (3).json",
  );
  assert.equal(
    await writeBuildFile(store.directory, { ...second, description: "更新" }),
    "治疗幻术 (3).json",
  );
  assert.equal(store.data.size, 3);
  assert.equal(parseBuild(store.data.get("治疗幻术.json")!).id, first.id);
  assert.equal(store.data.get("治疗幻术 (2).json"), "这是其他文件，不覆盖");
  assert.equal(
    parseBuild(store.data.get("治疗幻术 (3).json")!).description,
    "更新",
  );
  store.data.set(
    "ALPHA.JSON",
    JSON.stringify({ ...createBuild(), name: "Alpha" }),
  );
  assert.equal(
    await writeBuildFile(store.directory, { ...createBuild(), name: "alpha" }),
    "alpha (2).json",
  );
  const loaded = await readBuildDirectory(store.directory);
  assert.equal(loaded.skipped.length, 1);
  assert.equal(loaded.builds.length, 4);
});
