import test from "node:test";
import assert from "node:assert/strict";
import { createBuild, encodeShare, decodeShare } from "./domain.ts";
import {
  buildMetadata,
  createLibraryBackup,
  emptyMetadata,
  filterLibrary,
  parseLibraryBackup,
  parseTags,
} from "./library.ts";
import {
  METADATA_KEY,
  STORAGE_KEY,
  importLibraryBackup,
  readLibrary,
  readLibraryMetadata,
  saveBuildMetadata,
} from "./storage.ts";

class MemoryStorage {
  values = new Map<string, string>();
  failBuildWrite = false;
  failAllWrites = false;
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failAllWrites || (this.failBuildWrite && key === STORAGE_KEY))
      throw Error("quota");
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
function storage() {
  const value = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    value,
    configurable: true,
  });
  return value;
}

test("配装库组合筛选支持职业、收藏、标签及不区分大小写名称；不改变版本1配装", () => {
  const a = { ...createBuild("Mesmer"), name: "碎层 Quick" };
  const b = { ...createBuild("Guardian"), name: "碎层治疗" };
  const metadata = {
    [a.id]: { favorite: true, tags: ["碎层", "直伤"] },
    [b.id]: { favorite: false, tags: ["碎层"] },
  };
  const entries = [a, b];
  const before = JSON.stringify(entries);
  const filter = { query: "", profession: "", tag: "", favorites: false };
  assert.equal(filterLibrary(entries, metadata, filter).length, 2);
  assert.deepEqual(
    filterLibrary(entries, metadata, {
      ...filter,
      query: " quick ",
      profession: "Mesmer",
      tag: "碎层",
      favorites: true,
    }),
    [a],
  );
  assert.deepEqual(
    filterLibrary(entries, metadata, {
      ...filter,
      profession: "Guardian",
      favorites: true,
    }),
    [],
  );
  assert.deepEqual(filterLibrary(entries, {}, { ...filter, tag: "碎层" }), []);
  assert.equal(JSON.stringify(entries), before);
  assert.deepEqual(decodeShare(encodeShare(a)), a);
  assert.deepEqual(buildMetadata({}, "__proto__"), emptyMetadata());
});

test("标签去空去重并限制长度和数量，分类单独存储且不改变旧配装", () => {
  const store = storage();
  const b = createBuild();
  store.setItem(STORAGE_KEY, JSON.stringify([b]));
  assert.deepEqual(parseTags(" 碎层，直伤; 碎层； 日常 ,,"), [
    "碎层",
    "直伤",
    "日常",
  ]);
  assert.throws(() => parseTags("长".repeat(25)));
  assert.throws(() =>
    parseTags(Array.from({ length: 9 }, (_, i) => String(i)).join(",")),
  );
  const info = { favorite: true, tags: ["治疗"] };
  saveBuildMetadata(b.id, info);
  assert.deepEqual(readLibraryMetadata()[b.id], info);
  assert.deepEqual(readLibrary(), [b]);
  store.failAllWrites = true;
  assert.throws(() => saveBuildMetadata(b.id, emptyMetadata()));
  assert.deepEqual(readLibraryMetadata()[b.id], info);
});

test("分类损坏时不覆盖原资料，配装仍能读取", () => {
  const store = storage();
  const b = createBuild();
  store.setItem(STORAGE_KEY, JSON.stringify([b]));
  store.setItem(METADATA_KEY, "broken");
  assert.throws(readLibraryMetadata);
  assert.throws(() => saveBuildMetadata(b.id, emptyMetadata()));
  assert.equal(store.getItem(METADATA_KEY), "broken");
  assert.deepEqual(readLibrary(), [b]);
});

test("整库备份只包含现存配装分类，导入为独立记录且保留原有库", () => {
  const store = storage();
  const b = createBuild();
  store.setItem(STORAGE_KEY, JSON.stringify([b]));
  const info = { favorite: true, tags: ["日常"] };
  const backup = createLibraryBackup([b], { [b.id]: info, obsolete: info });
  assert.deepEqual(Object.keys(backup.metadata), [b.id]);
  const next = importLibraryBackup(parseLibraryBackup(JSON.stringify(backup)));
  assert.equal(next.builds.length, 2);
  assert.notEqual(next.builds[0].id, b.id);
  assert.deepEqual(next.builds[1], b);
  assert.deepEqual(next.metadata[next.builds[0].id], info);
  assert.deepEqual(readLibrary(), next.builds);
});

test("整库恢复遇到配装写入失败时回滚分类，未知版本和重复ID拒绝导入", () => {
  const store = storage();
  const b = createBuild();
  store.setItem(STORAGE_KEY, JSON.stringify([b]));
  saveBuildMetadata(b.id, { favorite: true, tags: ["保留"] });
  const previous = store.getItem(METADATA_KEY);
  const backup = createLibraryBackup([createBuild("Warrior")], {});
  store.failBuildWrite = true;
  assert.throws(() => importLibraryBackup(backup));
  assert.equal(store.getItem(METADATA_KEY), previous);
  assert.deepEqual(readLibrary(), [b]);
  assert.throws(() =>
    parseLibraryBackup(JSON.stringify({ ...backup, version: 2 })),
  );
  assert.throws(() =>
    parseLibraryBackup(JSON.stringify({ ...backup, builds: [b, b] })),
  );
  assert.throws(() => parseLibraryBackup(" ".repeat(8 * 1024 * 1024 + 1)));
});
