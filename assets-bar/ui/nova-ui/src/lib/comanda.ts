export type ComandaVariant = "mensagem" | "acao" | "aviso" | "conquista";

/** Visual identity of each kind of notice: label printed above the title + tinting color. */
export const COMANDA_META: Record<ComandaVariant, { label: string; tone: string }> = {
  mensagem: { label: "Recado no balcão", tone: "var(--neon-teal)" },
  acao: { label: "No bar", tone: "var(--primary)" },
  aviso: { label: "Fique de olho", tone: "var(--neon-red)" },
  conquista: { label: "Conquista", tone: "var(--accent)" },
};

export type StatDeltas = Partial<Record<"drunk" | "energy" | "mood" | "cash", number>>;

/**
 * Turns the numbers a move changed into the little line under a toast title.
 * Skips anything that did not move, so "acenar" stays a plain sentence.
 */
export function effectSummary(d: StatDeltas): string {
  const parts: string[] = [];
  const signed = (n: number) => `${n > 0 ? "+" : "-"}${Math.abs(n)}`;
  if (d.drunk) parts.push(`${signed(d.drunk)} álcool`);
  if (d.energy) parts.push(`${signed(d.energy)} energia`);
  if (d.mood) parts.push(`${signed(d.mood)} bom humor`);
  if (d.cash) parts.push(`${d.cash > 0 ? "+" : "-"}R$ ${Math.abs(d.cash)}`);
  return parts.join(" · ");
}
