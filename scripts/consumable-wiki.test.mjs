import test from "node:test";
import assert from "node:assert/strict";
import { parseConsumablePage, translateNutrition } from "./consumable-wiki.mjs";
const page = (body) =>
  `<script>RLCONF={"wgRevisionId":123,"wgPageName":"Example"}</script><div class="mw-parser-output"><div class="infobox"><span class="gamelink" data-type="item" data-id="91842"></span></div>${body}</div>`;
test("营养解析必须验证物品ID，保留换行与时长，不读取脚本或配方材料属性", () => {
  const html = page(
    '<blockquote><table id="nourishment1"><tr><td>icon</td><td>Nourishment (30 m): +100 Concentration<br>+70 Expertise</td></tr></table></blockquote><script>+900 Power</script>',
  );
  assert.equal(parseConsumablePage(html, 1).text, undefined);
  const result = parseConsumablePage(html, 91842);
  assert.equal(result.text, "+100 Concentration\n+70 Expertise");
  assert.equal(result.duration, 1800);
  assert.ok(result.sourceUrl.endsWith("oldid=123"));
  assert.equal(
    parseConsumablePage(
      page("<table><tr><td>Ingredients +100 Power</td></tr></table>"),
      91842,
    ).text,
    "",
  );
});
test("盛宴只跟随明确营养等价说明，不根据同名或制作材料猜测", () => {
  const parsed = parseConsumablePage(
    page(
      '<ul><li>Same nourishment effect as <a href="/wiki/Sage_Stuffed_Mushroom" title="Sage Stuffed Mushroom">Sage-Stuffed Mushroom</a> but lasts for 1 hour.</li></ul>',
    ),
    91842,
  );
  assert.deepEqual(parsed.equivalences, [
    {
      name: "Sage-Stuffed Mushroom",
      quote:
        "Same nourishment effect as Sage-Stuffed Mushroom but lasts for 1 hour.",
    },
  ]);
  assert.equal(
    translateNutrition(
      "+100 Concentration\n+70 Expertise\n+10% Outgoing Healing",
    ),
    "+100 增益效果\n+70 症状效果\n+10% 对其他盟友的治疗量",
  );
});

test("独立营养表与转义标题仍按精确ID解析，争议数值不发布", () => {
  const html = page(
    '<table id="nourishment1"><tr><td>icon</td><td>Nourishment (1 h): +45 All Attributes</td></tr></table>',
  ).replace('"wgPageName":"Example"', '"wgPageName":"Bowl_of_\\"Elon_Red\\""');
  const parsed = parseConsumablePage(html, 91842);
  assert.equal(parsed.text, "+45 All Attributes");
  assert.equal(parsed.duration, 3600);
  assert.ok(parsed.sourceUrl.includes("%22Elon_Red%22"));
  const disputed = page(
    '<blockquote><table id="nourishment1"><tr><td>icon</td><td>Nourishment (30 m): +900 Power<sup>[sic]</sup></td></tr></table></blockquote>',
  );
  assert.equal(parseConsumablePage(disputed, 91842).text, "");
  assert.equal(parseConsumablePage(disputed, 91842).disputed, true);
});
