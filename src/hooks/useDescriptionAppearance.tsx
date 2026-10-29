import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Build } from "../domain";
import {
  classicDescriptionStyle,
  descriptionStyleSchema,
  type DescriptionStyle,
} from "../markdown-style";

type Appearance = {
  defaultStyle?: DescriptionStyle;
  setDefault: (style?: DescriptionStyle) => string;
  overrides: Map<string, DescriptionStyle>;
  setOverride: (key: string, style?: DescriptionStyle) => void;
};
const Context = createContext<Appearance | null>(null);
export function DescriptionAppearanceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [defaultStyle, setDefaultStyle] = useState<DescriptionStyle>();
  const [overrides, setOverrides] = useState(
    new Map<string, DescriptionStyle>(),
  );
  const value = useMemo<Appearance>(
    () => ({
      defaultStyle,
      setDefault(style) {
        const checked = style ? descriptionStyleSchema.parse(style) : undefined;
        setDefaultStyle(
          checked?.css === classicDescriptionStyle.css ? undefined : checked,
        );
        return "已更新本次页面的默认CSS样式，未指定样式的BD会使用它。";
      },
      overrides,
      setOverride(key, style) {
        setOverrides((old) => {
          const next = new Map(old);
          if (style) next.set(key, descriptionStyleSchema.parse(style));
          else next.delete(key);
          if (next.size > 50) next.delete(next.keys().next().value!);
          return next;
        });
      },
    }),
    [defaultStyle, overrides],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDescriptionAppearance(build: Build, readonly = false) {
  const settings = useContext(Context);
  if (!settings) throw Error("CSS样式上下文尚未就绪。");
  const key = JSON.stringify([build.id, build.descriptionStyle ?? null]);
  const override = readonly ? settings.overrides.get(key) : undefined;
  return {
    ...settings,
    style: override || build.descriptionStyle || settings.defaultStyle,
    overridden: !!override,
    selectForViewing: (style?: DescriptionStyle) =>
      settings.setOverride(key, style || classicDescriptionStyle),
    restoreAuthor: () => settings.setOverride(key),
  };
}
