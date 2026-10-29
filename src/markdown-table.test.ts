import test from "node:test";
import assert from "node:assert/strict";
import {
  markdownTable,
  insertMarkdownTable,
  type TableAlignment,
} from "./markdown-table.ts";

test("快捷表格生成GFM表头、分隔符与指定数据行，三种对齐和最大尺寸正确", () => {
  for (const [alignment, separator] of [
    ["left", ":---"],
    ["center", ":---:"],
    ["right", "---:"],
  ] as const) {
    const table = markdownTable({ columns: 3, rows: 2, alignment });
    const lines = table.split("\n");
    assert.equal(lines.length, 4);
    assert.equal(lines[0], "| 表头1 | 表头2 | 表头3 |");
    assert.equal(lines[1], `| ${separator} | ${separator} | ${separator} |`);
    assert.equal(lines[2], "|  |  |  |");
  }
  assert.equal(
    markdownTable({ columns: 12, rows: 20, alignment: "left" }).split("\n")
      .length,
    22,
  );
});
test("表格在光标位置插入并补充空行，前后原文和第一表头选区正确", () => {
  const options = { columns: 2, rows: 1, alignment: "center" as const };
  for (const [text, position] of [
    ["", 0],
    ["前文后文", 2],
    ["前文\n\n后文", 4],
    ["前文\n", 3],
  ] as const) {
    const next = insertMarkdownTable(text, position, options);
    assert.equal(next.value.slice(next.start, next.end), "表头1");
    assert.ok(next.value.startsWith(text.slice(0, position)));
    assert.ok(next.value.endsWith(text.slice(position)));
    assert.ok(next.value.includes("| 表头1 | 表头2 |\n| :---: | :---: |"));
    if (position) assert.ok(next.value.includes("\n\n| 表头1"));
  }
});
test("非法尺寸、对齐、插入位置及正文超限明确拒绝，不截断原文", () => {
  for (const [columns, rows] of [
    [0, 1],
    [13, 1],
    [1, 0],
    [1, 21],
    [1.5, 1],
    [1, NaN],
  ])
    assert.throws(
      () => markdownTable({ columns, rows, alignment: "left" }),
      /1至12列/,
    );
  assert.throws(
    () =>
      markdownTable({
        columns: 1,
        rows: 1,
        alignment: "__proto__" as TableAlignment,
      }),
    /对齐方式无效/,
  );
  assert.throws(
    () =>
      insertMarkdownTable("文", 2, { columns: 1, rows: 1, alignment: "left" }),
    /位置已变化/,
  );
  assert.throws(
    () =>
      insertMarkdownTable("文".repeat(59990), 59990, {
        columns: 2,
        rows: 3,
        alignment: "left",
      }),
    /60,000字符/,
  );
});
