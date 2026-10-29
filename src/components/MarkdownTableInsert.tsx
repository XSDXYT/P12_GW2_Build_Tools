import { useLayoutEffect, useRef, useState } from "react";
import {
  markdownTable,
  type MarkdownTableOptions,
  type TableAlignment,
} from "../markdown-table";
import "../markdown-table.css";
export type TableInsertionPoint = { text: string; position: number };

export function MarkdownTableInsert({
  capture,
  insert,
}: {
  capture: () => TableInsertionPoint;
  insert: (point: TableInsertionPoint, options: MarkdownTableOptions) => void;
}) {
  const [open, setOpen] = useState(false);
  const [columns, setColumns] = useState("2"),
    [rows, setRows] = useState("3");
  const [alignment, setAlignment] = useState<TableAlignment>("left");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const columnsInput = useRef<HTMLInputElement>(null),
    grid = useRef<HTMLDivElement>(null);
  const point = useRef<TableInsertionPoint | null>(null);
  const options = { columns: Number(columns), rows: Number(rows), alignment };
  let validation = "";
  try {
    markdownTable(options);
  } catch (e) {
    validation = e instanceof Error ? e.message : "请选择有效的行列数。";
  }
  const highlighted = options;
  const gridCoordinate = (value: number) =>
    Number.isFinite(value)
      ? Math.min(3, Math.max(0, Math.trunc(value) - 1))
      : 0;
  const gridIndex =
    gridCoordinate(options.columns) + gridCoordinate(options.rows) * 4;
  useLayoutEffect(() => {
    if (!open) return;
    const current = dialog.current;
    current?.showModal();
    columnsInput.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      current?.close();
      document.body.style.overflow = overflow;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);
  const close = () => {
    setOpen(false);
    setError("");
  };
  function choose(c: number, r: number) {
    setColumns(String(c));
    setRows(String(r));
    setError("");
  }
  return (
    <>
      <button
        type="button"
        ref={trigger}
        title="选择行列数，快速插入Markdown表格。"
        aria-haspopup="dialog"
        onClick={() => {
          point.current = capture();
          setError("");
          setOpen(true);
        }}
      >
        表格
      </button>
      {open && (
        <dialog
          className="markdown-table-dialog"
          ref={dialog}
          aria-label="插入Markdown表格"
          onCancel={(event) => {
            event.preventDefault();
            event.stopPropagation();
            close();
          }}
        >
          <header>
            <h3>插入表格</h3>
            <button type="button" aria-label="关闭表格窗口" onClick={close}>
              ×
            </button>
          </header>
          <p className="markdown-table-help">
            选择尺寸或输入行列数，自动生成表头。插入后可直接编辑表头和内容。
          </p>
          <div className="markdown-table-settings">
            <div>
              <div
                className="markdown-table-grid"
                ref={grid}
                role="group"
                aria-label="快速选择表格尺寸"
              >
                {Array.from({ length: 16 }, (_, index) => {
                  const c = (index % 4) + 1,
                    r = Math.floor(index / 4) + 1;
                  return (
                    <button
                      type="button"
                      key={index}
                      aria-label={`${c}列、${r}行数据`}
                      aria-pressed={options.columns === c && options.rows === r}
                      tabIndex={index === gridIndex ? 0 : -1}
                      data-highlighted={
                        c <= highlighted.columns && r <= highlighted.rows
                      }
                      onClick={() => choose(c, r)}
                      onKeyDown={(event) => {
                        const next = {
                          ArrowLeft:
                            Math.max(0, (index % 4) - 1) +
                            Math.floor(index / 4) * 4,
                          ArrowRight:
                            Math.min(3, (index % 4) + 1) +
                            Math.floor(index / 4) * 4,
                          ArrowUp: index >= 4 ? index - 4 : index,
                          ArrowDown: index < 12 ? index + 4 : index,
                        }[event.key];
                        if (next === undefined) return;
                        event.preventDefault();
                        choose((next % 4) + 1, Math.floor(next / 4) + 1);
                        grid.current?.querySelectorAll("button")[next]?.focus();
                      }}
                    >
                      <span />
                    </button>
                  );
                })}
              </div>
              <small className="markdown-table-help" aria-live="polite">
                {Number.isInteger(highlighted.columns) &&
                Number.isInteger(highlighted.rows)
                  ? `${highlighted.columns}列 × ${highlighted.rows}行数据，另加1行表头`
                  : "请选择尺寸"}
              </small>
            </div>
            <div className="markdown-table-fields">
              <label>
                列数
                <input
                  ref={columnsInput}
                  type="number"
                  min={1}
                  max={12}
                  step={1}
                  value={columns}
                  onChange={(e) => {
                    setColumns(e.target.value);
                    setError("");
                  }}
                />
              </label>
              <label>
                数据行数（不含表头）
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={rows}
                  onChange={(e) => {
                    setRows(e.target.value);
                    setError("");
                  }}
                />
              </label>
              <label>
                文字对齐
                <select
                  aria-label="文字对齐"
                  value={alignment}
                  onChange={(e) =>
                    setAlignment(e.target.value as TableAlignment)
                  }
                >
                  <option value="left">左对齐</option>
                  <option value="center">居中</option>
                  <option value="right">右对齐</option>
                </select>
              </label>
            </div>
          </div>
          {!validation && (
            <div
              className="markdown-table-preview"
              role="region"
              aria-label="新表格预览"
            >
              <table>
                <thead>
                  <tr>
                    {Array.from({ length: options.columns }, (_, c) => (
                      <th style={{ textAlign: alignment }} key={c}>
                        表头{c + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.min(3, options.rows) }, (_, r) => (
                    <tr key={r}>
                      {Array.from({ length: options.columns }, (_, c) => (
                        <td key={c} style={{ textAlign: alignment }}>
                          内容
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {options.rows > 3 && (
                <small>预览前3行，实际插入{options.rows}行数据。</small>
              )}
            </div>
          )}
          {(validation || error) && (
            <p className="markdown-table-error" role="alert">
              {validation || error}
            </p>
          )}
          <p className="markdown-table-help">
            插入到光标位置；若选中了文字，会保留选中文字并在其后插入表格。
          </p>
          <footer>
            <button type="button" onClick={close}>
              取消
            </button>
            <button
              type="button"
              className="primary"
              disabled={!!validation}
              onClick={() => {
                if (!point.current) return;
                try {
                  insert(point.current, options);
                  close();
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "插入失败，原文已保留，请重试。",
                  );
                }
              }}
            >
              插入表格
            </button>
          </footer>
        </dialog>
      )}
    </>
  );
}
