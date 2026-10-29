import { useMemo, type ReactNode } from "react";
import { stylePresentation, type DescriptionStyle } from "../markdown-style";
import "../markdown-style.css";

/** Shared by live reading, the style workshop and PNG export. */
export function MarkdownStyle({
  style,
  className = "",
  children,
  label,
}: {
  style?: DescriptionStyle;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  const presentation = useMemo(() => {
    try {
      return stylePresentation(style);
    } catch {
      return { key: undefined, css: "" };
    }
  }, [style?.css]);
  return (
    <>
      {presentation.css && <style>{presentation.css}</style>}
      <div
        className={`md-content ${className}`}
        data-md-style={presentation.key}
        role={label ? "region" : undefined}
        aria-label={label}
      >
        {children}
      </div>
    </>
  );
}
