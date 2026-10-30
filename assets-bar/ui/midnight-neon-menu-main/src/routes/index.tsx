import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Map, Briefcase, Car, Users, Settings, Store, ChevronRight, Wallet, Landmark, Signal, Crosshair,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Neon Menu — Conceito de UI minimalista" },
      { name: "description", content: "Conceito de interface minimalista inspirado em menus de jogo, com painéis pretos e tons vaporwave." },
      { property: "og:title", content: "Neon Menu — Conceito de UI" },
      { property: "og:description", content: "Menus pretos, tipografia limpa e cores vaporwave suaves." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" },
    ],
  }),
  component: Index,
});

const items = [
  { icon: Map, label: "Mapa", info: "Los Santos · 14 locais marcados" },
  { icon: Briefcase, label: "Trabalhos", info: "3 contratos disponíveis" },
  { icon: Car, label: "Veículos", info: "Garagem · 8 de 10 vagas" },
  { icon: Store, label: "Loja", info: "Novidades da semana" },
  { icon: Users, label: "Sessão", info: "Online · 24 jogadores" },
  { icon: Settings, label: "Configurações", info: "Áudio, vídeo e controles" },
];

const tabs = ["Mapa", "Brief", "Amigos", "Galeria", "Jogo"];

function Index() {
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState(0);
  const sel = items[active] ?? items[0]!;

  return (
    <main className="relative min-h-screen overflow-hidden bg-sky">
      {/* horizonte */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 opacity-30 [background-image:linear-gradient(var(--vw-pink)_1px,transparent_1px),linear-gradient(90deg,var(--vw-pink)_1px,transparent_1px)] [background-size:60px_40px] [transform:perspective(400px)_rotateX(60deg)] origin-bottom" />
      <div className="pointer-events-none absolute left-1/2 top-[38%] h-64 w-64 -translate-x-1/2 rounded-full bg-pink/40 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 scanlines" />

      {/* HUD topo */}
      <header className="relative z-10 flex items-start justify-between p-8">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-foreground/60">PAUSE MENU</p>
          <h1 className="mt-1 text-4xl font-bold uppercase tracking-wider text-foreground">Neon Online</h1>
        </div>
        <div className="space-y-1 bg-panel px-5 py-3 text-right font-mono text-sm">
          <p className="flex items-center justify-end gap-2 text-cyan"><Wallet size={14} /> $ 1.284.090</p>
          <p className="flex items-center justify-end gap-2 text-muted-foreground"><Landmark size={14} /> $ 3.502.115</p>
        </div>
      </header>

      <section className="relative z-10 mx-8 max-w-5xl">
        {/* abas */}
        <nav className="flex gap-px">
          {tabs.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              className={`px-6 py-2 text-sm font-semibold uppercase tracking-widest transition-colors ${i === tab ? "bg-foreground text-primary-foreground" : "bg-panel text-muted-foreground hover:text-foreground"}`}>
              {t}
            </button>
          ))}
        </nav>
        <div className="h-0.5 bg-line" />

        <div className="mt-4 grid gap-4 md:grid-cols-[320px_1fr]">
          {/* lista */}
          <ul className="bg-panel">
            {items.map((it, i) => {
              const on = i === active;
              return (
                <li key={it.label}>
                  <button onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm uppercase tracking-wider transition-colors ${on ? "bg-foreground text-primary-foreground" : "text-foreground/80 hover:bg-secondary"}`}>
                    <it.icon size={16} strokeWidth={1.5} />
                    <span className="flex-1">{it.label}</span>
                    <ChevronRight size={14} className={on ? "opacity-100" : "opacity-0"} />
                  </button>
                </li>
              );
            })}
          </ul>

          {/* detalhe */}
          <div className="flex flex-col bg-panel">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-xl font-semibold uppercase tracking-wider">{sel.label}</h2>
              <sel.icon size={20} strokeWidth={1.25} className="text-pink" />
            </div>
            <div className="flex-1 space-y-5 px-6 py-6">
              <p className="text-muted-foreground">{sel.info}</p>
              {[["Reputação", 72, "bg-pink"], ["Habilidade", 54, "bg-lilac"], ["Resistência", 88, "bg-cyan"]].map(([n, v, c]) => (
                <div key={n as string}>
                  <div className="mb-1 flex justify-between font-mono text-xs uppercase text-muted-foreground">
                    <span>{n}</span><span>{v}%</span>
                  </div>
                  <div className="h-1 bg-secondary">
                    <div className={`h-full ${c}`} style={{ width: `${v}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t px-6 py-3 font-mono text-xs text-muted-foreground">
              <span className="flex items-center gap-2"><Signal size={12} /> Sessão pública</span>
              <span>{active + 1} / {items.length}</span>
            </div>
          </div>
        </div>
      </section>

      {/* dicas de controle */}
      <footer className="absolute bottom-6 right-8 z-10 flex gap-2 font-mono text-xs uppercase">
        {[["Enter", "Selecionar"], ["Esc", "Voltar"]].map(([k, l]) => (
          <span key={k} className="flex items-center gap-2 bg-panel px-3 py-2 text-foreground/80">
            <kbd className="border border-foreground/40 px-1.5">{k}</kbd>{l}
          </span>
        ))}
      </footer>
      <Crosshair size={18} strokeWidth={1} className="absolute bottom-8 left-8 z-10 text-foreground/40" />
    </main>
  );
}
