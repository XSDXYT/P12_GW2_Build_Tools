import test from "node:test";
import assert from "node:assert/strict";
import {
  imageDimensions,
  imageSlices,
  pngFilename,
  pngPartFilename,
  pngArchive,
} from "./build-image.ts";
import { unzipSync } from "fflate";
test("PNG文件名沿用BD标题清理规则，支持中文、保留名和已有后缀", () => {
  assert.equal(pngFilename(" 治疗：幻术/开荒 "), "治疗：幻术_开荒.png");
  assert.equal(pngFilename("CON"), "_CON.png");
  assert.equal(pngFilename("   "), "未命名配装.png");
  assert.equal(pngFilename("配装.PNG"), "配装.png");
});

test("高清超长图保持倍率自动分片，每张限额内，相邻有重叠且覆盖全部高度", () => {
  assert.deepEqual(imageSlices(1000, 4000, 2), [{ y: 0, height: 4000 }]);
  for (const scale of [1, 2]) {
    const height = 19000.4;
    const slices = imageSlices(1000, height, scale);
    assert.ok(slices.length > 1);
    assert.equal(slices[0].y, 0);
    for (const [i, slice] of slices.entries()) {
      const d = imageDimensions(1000, slice.height, scale);
      assert.equal(d.width, 1000 * scale);
      assert.ok(d.width * d.height <= 16_000_000);
      if (i) assert.equal(slice.y, slices[i - 1].y + slices[i - 1].height - 32);
    }
    assert.equal(slices.at(-1)!.y + slices.at(-1)!.height, Math.ceil(height));
  }
  assert.throws(() => imageSlices(1000, 100000, 2), /超过20张/);
  assert.throws(() => imageSlices(1000, Infinity, 2), /无法读取/);
});

test("多张PNG按标题编号打包，ZIP解压字节与各原图一致", async () => {
  assert.equal(pngPartFilename("幻术.png", 0, 1), "幻术.png");
  assert.equal(pngPartFilename("幻术.png", 1, 3), "幻术-02.png");
  const blobs = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];
  const zip = await pngArchive(
    blobs.map((bytes) => ({ blob: new Blob([bytes]) })),
    "幻术.png",
  );
  const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  assert.deepEqual(Object.keys(entries), ["幻术-01.png", "幻术-02.png"]);
  assert.deepEqual(entries["幻术-01.png"], blobs[0]);
  assert.deepEqual(entries["幻术-02.png"], blobs[1]);
});
test("长图按指定倍率生成完整尺寸，超出面积或边长时拒绝而非截断", () => {
  assert.deepEqual(imageDimensions(1000, 2400, 2), {
    width: 2000,
    height: 4800,
  });
  assert.deepEqual(imageDimensions(1000, 4000, 2), {
    width: 2000,
    height: 8000,
  });
  assert.throws(() => imageDimensions(1000, 4001, 2), /内容过长/);
  assert.throws(() => imageDimensions(100, 20000, 1), /内容过长/);
  for (const args of [
    [0, 1, 2],
    [1000, Infinity, 2],
    [1000, 1000, 3],
    [NaN, 1, 1],
  ])
    assert.throws(() => imageDimensions(...(args as [number, number, number])));
});
