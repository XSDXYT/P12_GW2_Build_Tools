import { useState } from "react";
import type { EditorProps } from "../editor";
import { buildTagsSchema, encountersSchema } from "../domain";
import { parseTags } from "../library";
import { bossOptions, instanceOptions } from "../encounter-catalog";
import { encounterModes, encounterModeNames } from "../encounter-modes";
import { EncounterSearch } from "./EncounterSearch";

export function BuildProperties({
  build,
  readonly,
  edit,
}: Pick<EditorProps, "build" | "readonly" | "edit">) {
  const [tag, setTag] = useState("");
  const [instance, setInstance] = useState("");
  const [boss, setBoss] = useState("");
  const [mode, setMode] = useState<(typeof encounterModes)[number]>("normal");
  const [error, setError] = useState("");
  return (
    <div className="build-properties" role="group" aria-label="BD属性">
      <h4>BD 属性</h4>
      <p className="muted">
        构筑标签与适用场景随 BD 保存和分享。
        {!readonly && "标题可在页面顶部修改。"}
      </p>
      <div className="library-tags" aria-label="构筑标签">
        {(build.tags || []).map((t) => (
          <span className="build-badge" key={t}>
            {t}
            {!readonly && (
              <button
                type="button"
                aria-label={`移除构筑标签${t}`}
                onClick={() =>
                  edit((b) => {
                    b.tags = b.tags?.filter((v) => v !== t);
                  })
                }
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!build.tags?.length && <span className="muted">暂无构筑标签</span>}
      </div>
      {!readonly && (
        <form
          className="build-property-form"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const tags = [
                ...new Set([...(build.tags || []), ...parseTags(tag)]),
              ];
              if (tags.length > 8)
                throw Error("每个配装最多 8 个标签，每个标签最多 24 字。");
              edit((b) => {
                b.tags = buildTagsSchema.parse(tags);
              });
              setTag("");
              setError("");
            } catch (e) {
              setError(e instanceof Error ? e.message : "标签无效。");
            }
          }}
        >
          <label>
            构筑标签
            <input
              aria-label="新增构筑标签"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              maxLength={256}
              placeholder="例如：治疗，增益，开荒"
            />
          </label>
          <button type="submit" disabled={!tag.trim()}>
            添加标签
          </button>
        </form>
      )}
      <ul className="build-encounters" aria-label="适用副本与BOSS">
        {(build.encounters || []).map((e, index) => (
          <li key={JSON.stringify([e.instance, e.boss || "", e.mode || ""])}>
            <span>
              {e.instance} / {e.boss || "副本通用"}
              {e.mode && ` · ${encounterModeNames[e.mode]}`}
            </span>
            {!readonly && (
              <button
                type="button"
                aria-label={`移除场景${e.instance}/${e.boss || "副本通用"}${e.mode ? "/" + encounterModeNames[e.mode] : ""}`}
                onClick={() =>
                  edit((b) => {
                    b.encounters = b.encounters?.filter((_, i) => i !== index);
                  })
                }
              >
                移除
              </button>
            )}
          </li>
        ))}
      </ul>
      {!build.encounters?.length && (
        <p className="muted">尚未指定副本 / BOSS，可用于通用构筑。</p>
      )}
      {!readonly && (
        <form
          className="build-property-form encounter-form"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const next = {
                instance: instance.trim(),
                ...(boss.trim() ? { boss: boss.trim() } : {}),
                mode,
              };
              if (
                build.encounters?.some(
                  (e) =>
                    e.instance === next.instance &&
                    (e.boss || "") === (next.boss || "") &&
                    e.mode === next.mode,
                )
              ) {
                setError("这个适用场景已添加。");
                return;
              }
              const values = encountersSchema.parse([
                ...(build.encounters || []),
                next,
              ]);
              edit((b) => {
                b.encounters = values;
              });
              setInstance("");
              setBoss("");
              setError("");
            } catch {
              setError(
                "副本不能为空，每项最多 60 字，最多添加 20 个适用场景。",
              );
            }
          }}
        >
          <EncounterSearch
            label="副本"
            ariaLabel="适用副本"
            value={instance}
            options={instanceOptions}
            placeholder="输入副本名称或 W1 等别名检索"
            change={(value) => {
              setInstance(value);
              setBoss("");
            }}
            select={(option) => {
              setInstance(option.value);
              setBoss("");
            }}
          />
          <EncounterSearch
            label="BOSS（可留空）"
            ariaLabel="适用BOSS"
            value={boss}
            options={bossOptions(instance)}
            placeholder="输入 BOSS 名称检索，留空为副本通用"
            change={setBoss}
            select={(option) => {
              setBoss(option.value);
              setInstance(option.detail!);
            }}
          />
          <label>
            模式
            <select
              aria-label="适用模式"
              value={mode}
              onChange={(event) => setMode(event.target.value as typeof mode)}
            >
              {encounterModes.map((value) => (
                <option key={value} value={value}>
                  {encounterModeNames[value]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!instance.trim()}>
            添加适用场景
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="library-error">
          {error}
        </p>
      )}
    </div>
  );
}
