import type { Attribute, Preview, PreviewControl } from "./attributes";

export type WikiAttributeRule = {
  target:
    | Attribute
    | "critical"
    | "criticalMultiplier"
    | "outgoingHealing"
    | "duration";
  amount: number;
  from?: Attribute;
  gates?: string[];
  anyGates?: string[];
  scaleWith?: Attribute;
  effect?: "Burning" | "Confusion";
  perMight?: boolean;
  perStack?: string;
  afterConversion?: boolean;
};
export type WikiAttributeDefinition = {
  trait: number;
  profession: string;
  name: string;
  rules: WikiAttributeRule[];
  controls: PreviewControl[];
  source: { title: string; revision: number };
};
export function previewCount(value: number | undefined, max: number) {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.trunc(value!)))
    : 0;
}
export function attributeRuleAmount(
  rule: WikiAttributeRule,
  controls: PreviewControl[],
  preview: Preview,
) {
  if (rule.perMight) return rule.amount * previewCount(preview.might, 25);
  if (rule.perStack) {
    const max = controls.find((c) => c.key === rule.perStack)?.max;
    return rule.amount * previewCount(preview.stacks[rule.perStack], max || 0);
  }
  return rule.amount;
}
