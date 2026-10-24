import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, Beer, Wine, Martini, Music, Laugh, PartyPopper, Hand, Users, MessageCircle, Backpack,
  Map as MapIcon, Sparkles, Send, Lock, Unlock, RotateCcw, LayoutGrid, Eye, EyeOff, Disc3,
  CircleDot, Target, Mic, Coffee, Zap, Smile, Heart, Coins, Cigarette, Gift,
} from "lucide-react";
import { DraggablePanel, type PanelState } from "@/components/hud/DraggablePanel";
import { showActionComanda, showComanda } from "@/components/hud/Comanda";
import { effectSummary } from "@/lib/comanda";
import barScene from "@/assets/bar-scene.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Boteco Social — Interface do Jogo" },
      { name: "description", content: "Interface flexível para um jogo social de bar: mova, recolha e organize os painéis do seu jeito." },
      { property: "og:title", content: "Boteco Social — Interface do Jogo" },
      { property: "og:description", content: "HUD personalizável para um jogo de bar com dança, bebidas e risadas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Game,
});

type PanelId = "status" | "actions" | "chat" | "friends" | "inventory" | "scene";
const PANELS: { id: PanelId; title: string; icon: typeof Beer; width: number }[] = [
  { id: "status", title: "Seu Estado", icon: Activity, width: 280 },
  { id: "actions", title: "Ações", icon: Sparkles, width: 340 },
  { id: "chat", title: "Papo no Balcão", icon: MessageCircle, width: 340 },
  { id: "friends", title: "Galera no Bar", icon: Users, width: 260 },
  { id: "inventory", title: "Bolso", icon: Backpack, width: 300 },
  { id: "scene", title: "Pelo Bar", icon: MapIcon, width: 280 },
];

/** Patrons who drop a note on the counter now and then. */
const GALERA = [
  { who: "Rita", text: "Vem jogar uma sinuca com a gente!", color: "text-accent", tone: "var(--accent)" },
  { who: "Zé do Copo", text: "Essa música é a minha favorita!", color: "text-neon-teal", tone: "var(--neon-teal)" },
  { who: "Lu Batuque", text: "Alguém viu meu isqueiro por aqui?", color: "text-neon-green", tone: "var(--neon-green)" },
  { who: "Bartender", text: "A rodada dupla ainda vai longe.", color: "text-primary", tone: "var(--primary)" },
  { who: "Marcão", text: "Manda um salgado aí, por favor.", color: "text-neon-teal", tone: "var(--neon-teal)" },
];

function defaultLayout(): Record<PanelId, PanelState> {
  const w = typeof window !== "undefined" ? window.innerWidth : 1280;
  const h = typeof window !== "undefined" ? window.innerHeight : 800;
  return {
    status: { x: 16, y: 80, collapsed: false, hidden: false, z: 1 },
    friends: { x: w - 276, y: 500, collapsed: true, hidden: false, z: 1 },
    scene: { x: w - 296, y: 80, collapsed: false, hidden: false, z: 1 },
    inventory: { x: w - 316, y: 560, collapsed: true, hidden: false, z: 1 },
    chat: { x: 16, y: Math.max(370, h - 300), collapsed: false, hidden: false, z: 1 },
    actions: { x: w / 2 - 170, y: h - 250, collapsed: false, hidden: false, z: 1 },
  };
}

const KEY = "boteco-hud-layout";

function Game() {
  const [layout, setLayout] = useState<Record<PanelId, PanelState> | null>(null);
  const [locked, setLocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [stats, setStats] = useState({ drunk: 35, energy: 70, mood: 80, cash: 120 });
  const [messages, setMessages] = useState([
    { who: "Rita", text: "Alguém aí pra uma partida de sinuca?", color: "text-accent" },
    { who: "Zé do Copo", text: "Essa música é minha!", color: "text-neon-teal" },
    { who: "Bartender", text: "Rodada dupla até meia-noite.", color: "text-primary" },
  ]);
  const [draft, setDraft] = useState("");
  const nextGalera = useRef(0);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    setLayout(saved ? { ...defaultLayout(), ...JSON.parse(saved) } : defaultLayout());
  }, []);
  useEffect(() => {
    if (layout) localStorage.setItem(KEY, JSON.stringify(layout));
  }, [layout]);

  // Someone at the bar keeps writing notes; each one lands in the chat panel
  // and as a comanda so you notice it even with the chat closed.
  useEffect(() => {
    const sayHi = () => {
      const g = GALERA[nextGalera.current % GALERA.length];
      if (!g) return;
      nextGalera.current += 1;
      setMessages((m) => [...m.slice(-30), { who: g.who, text: g.text, color: g.color }]);
      showComanda({ variant: "mensagem", title: g.who, text: g.text, initials: g.who.slice(0, 1), tone: g.tone });
    };

    const first = setTimeout(sayHi, 6000);
    const loop = setInterval(sayHi, 18000);
    return () => { clearTimeout(first); clearInterval(loop); };
  }, []);

  const update = useCallback((id: string, patch: Partial<PanelState>) => {
    setLayout((l) => (l ? { ...l, [id]: { ...l[id as PanelId], ...patch } } : l));
  }, []);
  const focus = useCallback((id: string) => {
    setLayout((l) => {
      if (!l) return l;
      const top = Math.max(...Object.values(l).map((p) => p.z));
      return l[id as PanelId].z === top ? l : { ...l, [id]: { ...l[id as PanelId], z: top + 1 } };
    });
  }, []);

  const act = (label: string, d: Parameters<typeof effectSummary>[0] = {}) => {
    const next = {
      drunk: clamp(stats.drunk + (d.drunk ?? 0)),
      energy: clamp(stats.energy + (d.energy ?? 0)),
      mood: clamp(stats.mood + (d.mood ?? 0)),
      cash: Math.max(0, stats.cash + (d.cash ?? 0)),
    };
    setStats(next);
    showActionComanda(label, d);
    if (next.cash === 0 && stats.cash > 0) {
      showComanda({ variant: "aviso", title: "Carteira zerada", text: "Peça uma fiada ou vá pra casa.", duration: 5200 });
    } else if (next.mood === 100 && stats.mood < 100) {
      showComanda({ variant: "conquista", title: "A casa toda de pé!", text: "Bom humor no talo.", duration: 5200 });
    }
  };

  const send = () => {
    if (!draft.trim()) return;
    setMessages((m) => [...m.slice(-30), { who: "Você", text: draft.trim(), color: "text-neon-green" }]);
    setDraft("");
  };

  const content: Record<PanelId, React.ReactNode> = {
    status: (
      <div className="space-y-3">
        <Bar icon={Beer} label="Teor alcoólico" value={stats.drunk} tone="bg-primary" />
        <Bar icon={Zap} label="Energia" value={stats.energy} tone="bg-neon-teal" />
        <Bar icon={Smile} label="Bom humor" value={stats.mood} tone="bg-accent" />
        <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
          <span className="flex items-center gap-2 font-bold"><Coins className="size-4 text-primary" /> Carteira</span>
          <span className="font-display text-xl neon-text">R$ {stats.cash}</span>
        </div>
      </div>
    ),
    actions: (
      <div className="grid grid-cols-4 gap-2">
        <ActionBtn icon={Beer} label="Beber" onClick={() => act("Saúde! Mais uma gelada.", { drunk: 8, mood: 4, cash: -8 })} />
        <ActionBtn icon={Music} label="Dançar" onClick={() => act("Arrasou na pista!", { energy: -10, mood: 8 })} />
        <ActionBtn icon={Laugh} label="Rir" onClick={() => act("Gargalhada contagiante!", { mood: 6 })} />
        <ActionBtn icon={PartyPopper} label="Brindar" onClick={() => act("Tim-tim geral!", { mood: 10, drunk: 3 })} />
        <ActionBtn icon={Hand} label="Acenar" onClick={() => act("Você acenou pra galera.")} />
        <ActionBtn icon={Heart} label="Paquerar" onClick={() => act("Olhar 43 ativado.", { mood: 3 })} />
        <ActionBtn icon={Mic} label="Cantar" onClick={() => act("Soltou a voz no karaokê!", { energy: -6, mood: 9 })} />
        <ActionBtn icon={Coffee} label="Água" onClick={() => act("Hidratação é tudo.", { drunk: -10, energy: 5, cash: -3 })} />
      </div>
    ),
    chat: (
      <div className="flex flex-col gap-2">
        <div className="h-36 space-y-1.5 overflow-y-auto pr-1 text-[15px] leading-snug">
          {messages.map((m, i) => (
            <p key={i}><span className={`font-extrabold ${m.color}`}>{m.who}:</span> {m.text}</p>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Fala aí..."
            className="flex-1 rounded-lg border-2 border-input bg-background/60 px-3 py-2 text-[15px] outline-none focus:border-primary"
          />
          <button className="hud-btn bg-primary px-3 text-primary-foreground" aria-label="Enviar"><Send className="size-4" /></button>
        </form>
      </div>
    ),
    friends: (
      <ul className="space-y-2">
        {[
          { n: "Rita", s: "Na sinuca", c: "bg-neon-green" },
          { n: "Zé do Copo", s: "Dançando", c: "bg-neon-green" },
          { n: "Lu Batuque", s: "No balcão", c: "bg-primary" },
          { n: "Marcão", s: "Ausente", c: "bg-muted-foreground" },
        ].map((f) => (
          <li key={f.n} className="flex items-center gap-3 rounded-lg bg-secondary/70 px-2 py-1.5">
            <span className="grid size-9 place-items-center rounded-full bg-muted font-display text-primary">{f.n[0]}</span>
            <div className="flex-1 leading-tight">
              <p className="font-extrabold">{f.n}</p>
              <p className="text-sm text-muted-foreground">{f.s}</p>
            </div>
            <span className={`size-2.5 rounded-full ${f.c}`} />
          </li>
        ))}
      </ul>
    ),
    inventory: (
      <div className="grid grid-cols-4 gap-2">
        {[
          { i: Beer, l: "Chopp", q: 2 }, { i: Wine, l: "Vinho", q: 1 }, { i: Martini, l: "Drink", q: 1 },
          { i: Coins, l: "Fichas", q: 5 }, { i: Gift, l: "Presente", q: 1 }, { i: Cigarette, l: "Isqueiro", q: 1 },
        ].map((it) => (
          <button key={it.l} className="hud-btn relative aspect-square flex-col text-xs" onClick={() => act(`Usou: ${it.l}`)}>
            <it.i className="size-6 text-primary" />
            {it.l}
            <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1.5 text-[11px] font-extrabold text-accent-foreground">{it.q}</span>
          </button>
        ))}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-lg border-2 border-dashed border-border/60" />
        ))}
      </div>
    ),
    scene: (
      <div className="space-y-2">
        {[
          { i: Disc3, l: "Jukebox", d: "Escolher música", msg: "Tocando um clássico!" },
          { i: CircleDot, l: "Sinuca", d: "Desafiar alguém", msg: "Mesa de sinuca reservada." },
          { i: Target, l: "Dardos", d: "Mirar no alvo", msg: "Na mosca!" },
          { i: Martini, l: "Balcão", d: "Pedir ao bartender", msg: "Pedido anotado." },
          { i: Music, l: "Pista", d: "Ir dançar", msg: "Partiu pista!" },
        ].map((s) => (
          <button key={s.l} className="hud-btn w-full justify-start px-3 py-2 text-left" onClick={() => act(s.msg)}>
            <s.i className="size-5 text-neon-teal" />
            <span className="flex-1 leading-tight">
              <span className="block font-extrabold">{s.l}</span>
              <span className="block text-sm text-muted-foreground">{s.d}</span>
            </span>
          </button>
        ))}
      </div>
    ),
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background">
      <img src={barScene} alt="Interior do bar" width={1920} height={1088} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background/50" />

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-[999] flex items-center justify-between px-4 py-3">
        <h1 className="animate-wobble font-display text-3xl neon-text md:text-4xl">Boteco Social</h1>
        <div className="relative flex gap-2">
          <button className="hud-btn px-3 py-2 font-bold" onClick={() => setLocked((v) => !v)}>
            {locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
            <span className="hidden sm:inline">{locked ? "Travado" : "Livre"}</span>
          </button>
          <button className="hud-btn px-3 py-2 font-bold" onClick={() => setMenuOpen((v) => !v)}>
            <LayoutGrid className="size-4" /> <span className="hidden sm:inline">Painéis</span>
          </button>
          {menuOpen && layout && (
            <div className="hud-panel absolute right-0 top-12 w-64 p-2">
              {PANELS.map((p) => (
                <button key={p.id} className="flex w-full items-center gap-2 rounded-md px-2 py-2 hover:bg-muted"
                  onClick={() => update(p.id, { hidden: !layout[p.id].hidden })}>
                  <p.icon className="size-4 text-primary" />
                  <span className="flex-1 text-left font-bold">{p.title}</span>
                  {layout[p.id].hidden ? <EyeOff className="size-4 text-muted-foreground" /> : <Eye className="size-4" />}
                </button>
              ))}
              <div className="mt-2 border-t-2 border-border/60 pt-2">
                <p className="px-2 pb-1 text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground">
                  Exemplos de aviso
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button className="hud-btn py-2 text-sm font-extrabold"
                    onClick={() => showComanda({ variant: "mensagem", title: "Rita", text: "Bora dançar uma?", initials: "R", tone: "var(--accent)" })}>
                    Recado
                  </button>
                  <button className="hud-btn py-2 text-sm font-extrabold"
                    onClick={() => showComanda({ variant: "acao", title: "Você pediu a conta", text: effectSummary({ cash: -42 }) })}>
                    Ação
                  </button>
                  <button className="hud-btn py-2 text-sm font-extrabold"
                    onClick={() => showComanda({ variant: "aviso", title: "A sinuca está ocupada", text: "Espere a próxima partida." })}>
                    Aviso
                  </button>
                  <button className="hud-btn py-2 text-sm font-extrabold"
                    onClick={() => showComanda({ variant: "conquista", title: "Rei da Pista", text: "Três músicas seguidas dançando." })}>
                    Conquista
                  </button>
                </div>
              </div>
              <button className="hud-btn mt-2 w-full py-2 font-bold" onClick={() => { setLayout(defaultLayout()); setMenuOpen(false); }}>
                <RotateCcw className="size-4" /> Restaurar layout
              </button>
            </div>
          )}
        </div>
      </div>

      {layout && PANELS.map((p) => (
        <DraggablePanel key={p.id} id={p.id} title={p.title} icon={p.icon} width={p.width}
          state={layout[p.id]} onChange={update} onFocus={focus} locked={locked}>
          {content[p.id]}
        </DraggablePanel>
      ))}
    </main>
  );
}

function clamp(n: number) { return Math.max(0, Math.min(100, n)); }

function Bar({ icon: Icon, label, value, tone }: { icon: typeof Beer; label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[15px] font-bold">
        <span className="flex items-center gap-2"><Icon className="size-4 text-primary" />{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full border-2 border-border bg-background/70">
        <div className={`h-full rounded-full ${tone} transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick }: { icon: typeof Beer; label: string; onClick: () => void }) {
  return (
    <button className="hud-btn flex-col py-2 text-sm font-extrabold" onClick={onClick}>
      <Icon className="size-6 text-primary" />
      {label}
    </button>
  );
}
