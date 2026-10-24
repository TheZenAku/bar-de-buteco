import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, GripVertical, type LucideIcon } from "lucide-react";

export type PanelState = { x: number; y: number; collapsed: boolean; hidden: boolean; z: number };

type Props = {
  id: string;
  title: string;
  icon: LucideIcon;
  state: PanelState;
  width: number;
  onChange: (id: string, patch: Partial<PanelState>) => void;
  onFocus: (id: string) => void;
  locked: boolean;
  children: ReactNode;
};

export function DraggablePanel({ id, title, icon: Icon, state, width, onChange, onFocus, locked, children }: Props) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      const x = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - drag.current.dx));
      const y = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - drag.current.dy));
      onChange(id, { x, y });
    };
    const up = () => {
      drag.current = null;
      setDragging(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, id, onChange]);

  if (state.hidden) return null;

  return (
    <section
      className={`hud-panel absolute select-none ${dragging ? "ring-2 ring-primary" : ""}`}
      style={{ left: state.x, top: state.y, width, zIndex: state.z }}
      onPointerDown={() => onFocus(id)}
      aria-label={title}
    >
      <header
        className={`flex items-center gap-2 px-3 py-2 ${locked ? "" : "cursor-grab active:cursor-grabbing"}`}
        onPointerDown={(e) => {
          if (locked || (e.target as HTMLElement).closest("button")) return;
          drag.current = { dx: e.clientX - state.x, dy: e.clientY - state.y };
          setDragging(true);
        }}
      >
        {!locked && <GripVertical className="size-4 text-muted-foreground" />}
        <Icon className="size-5 text-primary" />
        <h2 className="flex-1 font-display text-lg tracking-wide">{title}</h2>
        <button
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => onChange(id, { collapsed: !state.collapsed })}
          aria-label={state.collapsed ? "Expandir" : "Recolher"}
        >
          <ChevronDown className={`size-5 transition-transform ${state.collapsed ? "-rotate-90" : ""}`} />
        </button>
      </header>
      {!state.collapsed && <div className="border-t-2 border-border/60 p-3">{children}</div>}
    </section>
  );
}
