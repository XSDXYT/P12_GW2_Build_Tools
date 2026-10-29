export type TableAlignment = "left" | "center" | "right";
export type MarkdownTableOptions = {
  columns: number;
  rows: number;
  alignment: TableAlignment;
};

export function markdownTable({
  columns,
  rows,
  alignment,
}: MarkdownTableOptions) {
  if (
    !Number.isInteger(columns) ||
    columns < 1 ||
    columns > 12 ||
    !Number.isInteger(rows) ||
    rows < 1 ||
    rows > 20
  )
    throw Error("请选择1至12列、1至20行数据；表头会额外添加一行。");
  if (!["left", "center", "right"].includes(alignment))
    throw Error("表格对齐方式无效。");
  const separator = { left: ":---", center: ":---:", right: "---:" }[alignment];
  const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [
    row(Array.from({ length: columns }, (_, i) => `表头${i + 1}`)),
    row(Array(columns).fill(separator)),
    ...Array.from({ length: rows }, () => row(Array(columns).fill(""))),
  ].join("\n");
}

/** Insert at the captured caret/selection end, preserving all existing text. */
export function insertMarkdownTable(
  text: string,
  position: number,
  options: MarkdownTableOptions,
) {
  if (!Number.isInteger(position) || position < 0 || position > text.length)
    throw Error("插入位置已变化，请重新打开表格窗口。");
  const before = text.slice(0, position),
    after = text.slice(position);
  const prefix =
    !before || before.endsWith("\n\n")
      ? ""
      : before.endsWith("\n")
        ? "\n"
        : "\n\n";
  const suffix = after.startsWith("\n\n")
    ? ""
    : after.startsWith("\n")
      ? "\n"
      : "\n\n";
  const value = before + prefix + markdownTable(options) + suffix + after;
  if (value.length > 60000)
    throw Error(
      "插入表格后将超过60,000字符，原文已保留。请减少行列或精简正文后重试。",
    );
  const start = before.length + prefix.length + 2;
  return { value, start, end: start + "表头1".length };
}
