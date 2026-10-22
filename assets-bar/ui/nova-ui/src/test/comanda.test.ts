import { describe, expect, it } from "vitest";

import { COMANDA_META, effectSummary } from "@/lib/comanda";

describe("effectSummary", () => {
  it("reads like the bar's own scoreboard", () => {
    expect(effectSummary({ drunk: 8, mood: 4, cash: -8 })).toBe(
      "+8 álcool · +4 bom humor · -R$ 8",
    );
  });

  it("stays empty when the move changes nothing", () => {
    expect(effectSummary({})).toBe("");
  });

  it("marks a cost with a minus sign", () => {
    expect(effectSummary({ energy: -10 })).toBe("-10 energia");
  });
});

describe("COMANDA_META", () => {
  it("covers every notice kind with a label and a color", () => {
    expect(Object.keys(COMANDA_META)).toEqual(["mensagem", "acao", "aviso", "conquista"]);
    for (const meta of Object.values(COMANDA_META)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.tone.startsWith("var(--")).toBe(true);
    }
  });
});
