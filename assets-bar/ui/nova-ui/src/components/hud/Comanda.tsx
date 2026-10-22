import { toast } from "sonner";
import {
  AlertTriangle,
  MessageCircle,
  PartyPopper,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { COMANDA_META, effectSummary, type ComandaVariant, type StatDeltas } from "@/lib/comanda";

const ICONS: Record<ComandaVariant, LucideIcon> = {
  mensagem: MessageCircle,
  acao: Sparkles,
  aviso: AlertTriangle,
  conquista: PartyPopper,
};

export type ComandaOptions = {
  variant?: ComandaVariant;
  title: string;
  text?: string;
  /** Overrides the variant color — used to tint each chat sender differently. */
  tone?: string;
  /** Shows the sender's initial in the badge instead of an icon. */
  initials?: string;
  duration?: number;
  id?: string | number;
};

/**
 * Slaps a bar-ticket notice on screen: perforated stub on the left, colored spine,
 * title in the display font and a timer bar that drains while you read it.
 */
export function showComanda({
  variant = "acao",
  title,
  text,
  tone,
  initials,
  duration = 4200,
  id,
}: ComandaOptions) {
  const Icon = ICONS[variant];
  return toast.custom(
    (toastId) => (
      <div
        className="comanda"
        data-variant={variant}
        style={
          {
            "--comanda": tone ?? COMANDA_META[variant].tone,
            "--comanda-run": `${duration}ms`,
          } as React.CSSProperties
        }
      >
        <span className="comanda__stub" aria-hidden="true" />
        <span className="comanda__badge">
          {initials ? (
            <span className="comanda__initials">{initials}</span>
          ) : (
            <Icon className="size-5" aria-hidden="true" />
          )}
        </span>
        <div className="comanda__body">
          <p className="comanda__eyebrow">{COMANDA_META[variant].label}</p>
          <p className="comanda__title">{title}</p>
          {text ? <p className="comanda__text">{text}</p> : null}
        </div>
        <button
          type="button"
          className="comanda__close"
          aria-label="Fechar aviso"
          onClick={() => toast.dismiss(toastId)}
        >
          <X className="size-4" />
        </button>
        <span className="comanda__timer" aria-hidden="true" />
      </div>
    ),
    { duration, className: "comanda-wrap", ...(id === undefined ? {} : { id }) },

  );
}

/** Convenience wrapper for a player action: title + the stats it moved. */
export function showActionComanda(title: string, deltas: StatDeltas) {
  return showComanda({ variant: "acao", title, text: effectSummary(deltas), duration: 3400 });
}
