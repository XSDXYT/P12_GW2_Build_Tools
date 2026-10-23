import test from "node:test";
import assert from "node:assert/strict";
import { createBuild, decodeShare, encodeShare } from "./domain.ts";
import { createLibraryBackup, parseLibraryBackup } from "./library.ts";
import { readLegacyBackup, STORAGE_KEY, METADATA_KEY } from "./storage.ts";

function storage(values: Record<string, string>) {
  const data = new Map(Object.entries(values));
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: () => {
        throw Error("Browser writes are forbidden");
      },
      removeItem: () => {
        throw Error("Browser deletion is forbidden");
      },
    },
  });
  return data;
}

test("旧整库备份仍可读，保留已有分类和版本1配装分享", () => {
  const b = createBuild();
  const info = { favorite: true, tags: ["治疗"] };
  const backup = createLibraryBackup([b], { [b.id]: info, obsolete: info });
  assert.deepEqual(Object.keys(backup.metadata), [b.id]);
  assert.deepEqual(parseLibraryBackup(JSON.stringify(backup)), backup);
  assert.deepEqual(decodeShare(encodeShare(b)), b);
});

test("旧浏览器库仅可读取迁移，原配装和分类均不写入或清理", () => {
  const b = createBuild();
  const metadata = { [b.id]: { favorite: true, tags: ["治疗"] } };
  const store = storage({
    [STORAGE_KEY]: JSON.stringify([b]),
    [METADATA_KEY]: JSON.stringify({ version: 1, entries: metadata }),
  });
  const before = [...store];
  assert.deepEqual(readLegacyBackup(), createLibraryBackup([b], metadata));
  assert.deepEqual([...store], before);
});

test("旧分类损坏不阻止配装迁移；坏配装不会覆盖或删除原始记录", () => {
  const b = createBuild();
  const store = storage({
    [STORAGE_KEY]: JSON.stringify([b]),
    [METADATA_KEY]: "broken",
  });
  assert.deepEqual(readLegacyBackup()?.builds, [b]);
  assert.deepEqual(readLegacyBackup()?.metadata, {});
  assert.equal(store.get(METADATA_KEY), "broken");
  store.set(STORAGE_KEY, "broken");
  assert.throws(readLegacyBackup);
  assert.equal(store.get(STORAGE_KEY), "broken");
  store.delete(STORAGE_KEY);
  assert.equal(readLegacyBackup(), null);
});

test("旧备份拒绝未知版本、重复ID及超大输入", () => {
  const b = createBuild();
  const backup = createLibraryBackup([b], {});
  assert.throws(() =>
    parseLibraryBackup(JSON.stringify({ ...backup, version: 2 })),
  );
  assert.throws(() =>
    parseLibraryBackup(JSON.stringify({ ...backup, builds: [b, b] })),
  );
  assert.throws(() => parseLibraryBackup(" ".repeat(8 * 1024 * 1024 + 1)));
});
