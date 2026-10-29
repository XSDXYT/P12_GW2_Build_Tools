import parse from "css-tree/parser";
import generate from "css-tree/generator";
import walk from "css-tree/walker";
import type { CssNode } from "css-tree";
import { z } from "zod";
import { jsonFilename } from "./build-filename";

export const maxStyleLength = 20000;
const properties = new Set(
  `color background background-color box-shadow opacity
font font-family font-size font-weight font-style font-variant line-height letter-spacing word-spacing
text-align text-decoration text-decoration-color text-decoration-line text-decoration-style text-transform text-indent text-shadow
white-space overflow-wrap word-break tab-size
margin margin-top margin-right margin-bottom margin-left margin-inline margin-block margin-inline-start margin-inline-end
padding padding-top padding-right padding-bottom padding-left padding-inline padding-block padding-inline-start padding-inline-end
border border-top border-right border-bottom border-left border-color border-style border-width border-radius border-collapse border-spacing
border-top-color border-right-color border-bottom-color border-left-color border-inline-start border-inline-end
width min-width max-width height min-height max-height box-sizing display vertical-align
gap row-gap column-gap align-items justify-content flex flex-wrap flex-direction flex-grow flex-shrink flex-basis
grid-template-columns grid-template-rows list-style list-style-type list-style-position
overflow overflow-x overflow-y table-layout caption-side outline outline-color outline-width outline-style outline-offset
`
    .split(/\s+/)
    .filter(Boolean),
);
const functions = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "calc",
  "min",
  "max",
  "clamp",
  "var",
  "minmax",
  "repeat",
]);

/** Parse and scope CSS before insertion; arbitrary CSS never reaches a style tag. */
export function compileMarkdownStyle(
  css: string,
  scope = ".md-content[data-md-style]",
) {
  if (!css.trim() || css.length > maxStyleLength)
    throw Error("CSS不能为空，且最多20,000个字符。");
  let ast: CssNode;
  try {
    ast = parse(css, {
      parseCustomProperty: true,
      onParseError: (error) => {
        throw error;
      },
    });
  } catch {
    throw Error("CSS语法有误，请检查选择器、分号和花括号。");
  }
  let rules = 0;
  walk(ast, (node) => {
    if (node.type === "Raw" || node.type === "Url")
      throw Error("CSS不支持外部资源、url()或无法识别的语法。");
    if (
      node.type === "Atrule" &&
      (node.name.toLowerCase() !== "media" || !node.block)
    )
      throw Error("CSS仅支持普通规则和@media，不支持@import或字体加载。");
    if (node.type === "Function" && !functions.has(node.name.toLowerCase()))
      throw Error(`CSS不支持函数 ${node.name}()。`);
    if (node.type === "Function" && node.name.toLowerCase() === "var") {
      const variable = node.children.first;
      if (
        variable?.type !== "Identifier" ||
        !/^--md-[a-z0-9-]+$/.test(variable.name)
      )
        throw Error("CSS变量请使用--md-前缀，避免读取页面其他区域的变量。");
    }
    if (
      node.type === "Declaration" &&
      !properties.has(node.property.toLowerCase()) &&
      !/^--md-[a-z0-9-]+$/.test(node.property)
    )
      throw Error(
        `CSS不支持属性 ${node.property}，请使用正文排版、颜色和边框属性。`,
      );
    if (node.type === "Rule") {
      if (++rules > 200 || node.prelude.type !== "SelectorList")
        throw Error("CSS规则过多或选择器无效。");
      if (node.block.children.some((child) => child.type !== "Declaration"))
        throw Error("请展开嵌套CSS，使用完整选择器。");
      node.prelude.children.forEach((selector) => {
        if (selector.type !== "Selector") throw Error("CSS选择器无效。");
        walk(selector, (part) => {
          if (
            part.type === "Combinator" &&
            ["+", "~", "||"].includes(part.name)
          )
            throw Error(
              "CSS不支持兄弟选择器，请使用正文内的后代或子元素选择器。",
            );
          if (
            part.type === "PseudoClassSelector" &&
            ![
              "root",
              "hover",
              "focus",
              "focus-visible",
              "first-child",
              "last-child",
              "nth-child",
              "nth-of-type",
              "not",
              "is",
              "where",
            ].includes(part.name.toLowerCase())
          )
            throw Error(`CSS不支持伪类 :${part.name}。`);
        });
        const value = generate(selector);
        // A root alias can only be the start of a selector. Sibling combinators
        // are excluded above, so replacement cannot target anything outside it.
        const alias =
          /^(?:\.md-content|\.markdown-body|\.png-markdown|:root)(?=[\s.#:[>]|$)/;
        const scoped = alias.test(value)
          ? value.replace(alias, scope)
          : `${scope} ${value}`;
        const parsed = parse(scoped, { context: "selector" });
        if (parsed.type !== "Selector") throw Error("CSS选择器无效。");
        selector.children = parsed.children;
      });
    }
  });
  if (!rules) throw Error("CSS中至少需要一条正文样式规则。");
  return generate(ast);
}

export const descriptionStyleSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "请输入模板名称。")
      .max(60, "模板名称最多60个字符。"),
    css: z
      .string()
      .max(maxStyleLength, "CSS最多20,000个字符。")
      .superRefine((css, ctx) => {
        try {
          compileMarkdownStyle(css);
        } catch (e) {
          ctx.addIssue({
            code: "custom",
            message: e instanceof Error ? e.message : "CSS无效。",
          });
        }
      }),
  })
  .strict();
export type DescriptionStyle = z.infer<typeof descriptionStyleSchema>;
export const classicDescriptionStyle: DescriptionStyle = {
  name: "经典样式",
  css: ".md-content {}",
};
export const cssDefaultsSchema = z
  .object({
    kind: z.literal("p12-css-default"),
    version: z.literal(1),
    style: descriptionStyleSchema.nullable(),
  })
  .strict();

export function stylePresentation(style?: DescriptionStyle) {
  if (!style || style.css === classicDescriptionStyle.css)
    return { key: undefined, css: "" };
  let hash = 2166136261;
  for (let i = 0; i < style.css.length; i++)
    hash = Math.imul(hash ^ style.css.charCodeAt(i), 16777619);
  const key = `s${(hash >>> 0).toString(36)}-${style.css.length}`;
  return {
    key,
    css: compileMarkdownStyle(style.css, `.md-content[data-md-style="${key}"]`),
  };
}
export function cssFilename(name: string) {
  return jsonFilename(name.replace(/\.css$/iu, "")).replace(
    /\.json$/iu,
    ".css",
  );
}
export const builtinMarkdownStyles = [
  {
    file: "mist-gold.css",
    name: "迷雾金笺",
    summary: "深色暖金 · 团队攻略",
    color: "#d9be87",
    background: "#142a31",
  },
  {
    file: "astral-notes.css",
    name: "星界札记",
    summary: "星界紫色 · 玩法札记",
    color: "#c6adfa",
    background: "#242039",
  },
  {
    file: "clear-guide.css",
    name: "清纸攻略",
    summary: "清爽浅色 · 长文阅读",
    color: "#245e86",
    background: "#f4f8fc",
  },
];
