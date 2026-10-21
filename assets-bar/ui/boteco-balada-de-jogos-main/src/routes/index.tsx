import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import bg from "@/assets/boteco-bg.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Boteco Sem Noção — Conceito de UI" },
      { name: "description", content: "Conceito de interface do jogo de boteco: beba, resenhe, jogue truco, sinuca e blackjack." },
      { property: "og:title", content: "Boteco Sem Noção" },
      { property: "og:description", content: "Beba, resenhe e perca a dignidade no boteco mais sem noção da internet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Stats = { teor: number; bexiga: number; dignidade: number; figado: number };

const HOTSPOTS = [
  { label: "Balcão", sub: "pendura aí, Zé", x: "4%", y: "18%", rot: "-6deg" },
  { label: "Sinuca", sub: "R$ 2 a ficha", x: "70%", y: "48%", rot: "4deg" },
  { label: "Truco", sub: "mesa 3 tá roubando", x: "47%", y: "40%", rot: "-3deg" },
  { label: "Banheiro", sub: "não recomendado", x: "30%", y: "30%", rot: "7deg" },
];

const START_CHAT = [
  { who: "Seu Tonhão", msg: "ESSA RODADA É MINHA, PORRA", c: "text-cerveja" },
  { who: "Kelly da Sinuca", msg: "quem encostou na minha bola 8 vai apanhar", c: "text-menta" },
  { who: "Garçom Jurandir", msg: "a máquina de cartão tá sem sinal de novo", c: "text-espuma" },
];

function Bar({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center justify-between font-display text-[10px] tracking-wider text-guardanapo">
        <span>{icon} {label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-4 overflow-hidden rounded-sm border-2 border-piche bg-garrafa">
        <div className={`h-full ${tone} transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Card({ v, s, hidden }: { v: string; s: string; hidden?: boolean }) {
  const red = s === "♥" || s === "♦";
  if (hidden)
    return <div className="sticker h-20 w-14 bg-conhaque stain flex items-center justify-center font-shade text-xl text-espuma">?</div>;
  return (
    <div className={`sticker h-20 w-14 bg-guardanapo p-1 font-display ${red ? "text-conhaque" : "text-garrafa"}`}>
      <div className="text-sm leading-none">{v}</div>
      <div className="text-center text-2xl">{s}</div>
    </div>
  );
}

function Index() {
  const [stats, setStats] = useState<Stats>({ teor: 42, bexiga: 67, dignidade: 31, figado: 58 });
  const [cash, setCash] = useState(17.5);
  const [chat, setChat] = useState(START_CHAT);
  const [hand, setHand] = useState([{ v: "K", s: "♠" }, { v: "7", s: "♥" }]);

  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const act = (d: Partial<Stats>, cost: number, msg: string) => {
    setStats((s) => ({
      teor: clamp(s.teor + (d.teor ?? 0)),
      bexiga: clamp(s.bexiga + (d.bexiga ?? 0)),
      dignidade: clamp(s.dignidade + (d.dignidade ?? 0)),
      figado: clamp(s.figado + (d.figado ?? 0)),
    }));
    setCash((c) => Math.max(0, +(c - cost).toFixed(2)));
    setChat((c) => [...c.slice(-6), { who: "Você", msg, c: "text-vodka" }]);
  };

  const ACTIONS = [
    { e: "🍺", t: "Pedir gelada", f: () => act({ teor: 8, bexiga: 12, figado: -3 }, 9, "desce uma gelada aí, trincando!") },
    { e: "🥃", t: "Shot de vodka", f: () => act({ teor: 18, dignidade: -8, figado: -9 }, 6, "VODKA É ÁGUA QUE PASSOU NA RÚSSIA") },
    { e: "🗣️", t: "Resenhar", f: () => act({ dignidade: -4 }, 0, "cês não sabem da minha ex...") },
    { e: "🚽", t: "Ir mijar", f: () => act({ bexiga: -60, dignidade: -3 }, 0, "segura minha cadeira que já volto") },
    { e: "🤮", t: "Chamar o Hugo", f: () => act({ teor: -25, dignidade: -25 }, 0, "BLÉÉÉÉ (no pé do Tonhão)") },
  ];

  const total = hand.reduce((a, c) => a + (c.v === "A" ? 11 : ["K", "Q", "J"].includes(c.v) ? 10 : +c.v), 0);
  const hit = () => {
    const vs = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const ss = ["♠", "♥", "♦", "♣"];
    if (hand.length >= 5) return setHand([{ v: "K", s: "♠" }, { v: "7", s: "♥" }]);
    setHand((h) => [...h, { v: vs[Math.floor(Math.random() * 13)]!, s: ss[Math.floor(Math.random() * 4)]! }]);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <img src={bg} alt="" width={1920} height={1088} className="absolute inset-0 h-full w-full object-cover opacity-70" />
      <div className="absolute inset-0 bg-gradient-to-b from-garrafa/80 via-transparent to-piche/90" />

      <div className="relative z-10 flex min-h-screen flex-col gap-4 p-4 lg:p-6">
        {/* HUD */}
        <header className="flex flex-wrap items-center gap-4">
          <div className="wobble sticker bg-beer px-4 py-2">
            <h1 className="font-shade text-2xl leading-none text-piche md:text-3xl">BOTECO</h1>
            <p className="font-hand -mt-1 text-right text-sm text-garrafa">sem noção</p>
          </div>

          <div className="sticker flex items-center gap-3 bg-card px-3 py-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-piche bg-cerveja font-display text-piche">ZÉ</div>
            <div>
              <p className="font-display text-sm text-espuma">Zé Pinguço</p>
              <p className="text-xs text-menta">Nível 12 · Cachaceiro Júnior</p>
            </div>
          </div>

          <div className="sticker flex flex-1 flex-wrap gap-3 bg-card/90 px-4 py-2 backdrop-blur">
            <Bar icon="🍻" label="TEOR" value={stats.teor} tone="bg-beer" />
            <Bar icon="💦" label="BEXIGA" value={stats.bexiga} tone="bg-espuma" />
            <Bar icon="🎩" label="DIGNIDADE" value={stats.dignidade} tone="bg-menta" />
            <Bar icon="🫀" label="FÍGADO" value={stats.figado} tone="bg-conhaque" />
          </div>

          <div className="sticker rotate-2 bg-guardanapo px-4 py-2 text-piche">
            <p className="font-hand text-xs">na carteira</p>
            <p className="font-display text-xl">R$ {cash.toFixed(2).replace(".", ",")}</p>
          </div>
        </header>

        {/* Main area */}
        <section className="grid flex-1 gap-4 lg:grid-cols-[1fr_340px]">
          <div className="relative min-h-[380px]">
            {HOTSPOTS.map((h) => (
              <button
                key={h.label}
                className="btn-boteco absolute rounded-md bg-guardanapo px-3 py-1 text-left text-piche"
                style={{ left: h.x, top: h.y, rotate: h.rot }}
              >
                <span className="block text-sm">📍 {h.label}</span>
                <span className="font-hand block text-xs text-conhaque">{h.sub}</span>
              </button>
            ))}

            {stats.bexiga > 80 && (
              <div className="wobble sticker absolute right-4 top-4 bg-espuma px-3 py-2 font-display text-sm text-piche">
                ⚠️ VAI MIJAR NAS CALÇAS!
              </div>
            )}

            {/* Blackjack */}
            <div className="sticker bg-felt absolute bottom-0 left-0 w-[300px] -rotate-1 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-sm text-guardanapo">♠ 21 DO BAIANO</h2>
                <span className="font-hand text-sm text-espuma">aposta: 1 dose</span>
              </div>
              <div className="mb-3 flex gap-2">
                <Card v="" s="" hidden />
                <Card v="9" s="♣" />
              </div>
              <div className="flex gap-2">
                {hand.map((c, i) => <Card key={i} {...c} />)}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className={`font-display text-lg ${total > 21 ? "text-destructive" : "text-espuma"}`}>
                  {total > 21 ? "ESTOUROU!" : total}
                </span>
                <button onClick={hit} className="btn-boteco ml-auto rounded bg-cerveja px-3 py-1 text-xs text-piche">PEDIR</button>
                <button className="btn-boteco rounded bg-vodka px-3 py-1 text-xs text-garrafa">PARAR</button>
              </div>
            </div>
          </div>

          {/* Chat */}
          <aside className="sticker stain flex max-h-[520px] flex-col bg-card/95">
            <div className="flex items-center justify-between border-b-2 border-piche bg-sinuca px-4 py-2">
              <h2 className="font-display text-sm text-vodka">💬 RESENHA</h2>
              <span className="font-hand text-xs text-espuma">23 bêbados online</span>
            </div>
            <ul className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
              {chat.map((m, i) => (
                <li key={i} className="leading-snug">
                  <span className={`font-display text-xs ${m.c}`}>{m.who}:</span>{" "}
                  <span className="text-guardanapo">{m.msg}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 border-t-2 border-piche p-3">
              <input placeholder="manda a braba..." className="flex-1 rounded border-2 border-piche bg-garrafa px-3 py-2 text-sm text-guardanapo placeholder:text-menta/60 focus:outline-none focus:ring-2 focus:ring-ring" />
              <button className="btn-boteco rounded bg-cerveja px-3 text-xs text-piche">FALA</button>
            </div>
          </aside>
        </section>

        {/* Action bar */}
        <nav className="flex flex-wrap justify-center gap-3">
          {ACTIONS.map((a, i) => (
            <button
              key={a.t}
              onClick={a.f}
              className={`btn-boteco relative flex w-28 flex-col items-center gap-1 rounded-lg py-3 text-[11px] ${i % 2 ? "bg-menta text-garrafa" : "bg-beer text-piche"}`}
              style={{ rotate: `${(i - 2) * 1.5}deg` }}
            >
              {i === 0 && <span className="bubble absolute top-2 h-2 w-2 rounded-full bg-guardanapo" />}
              <span className="text-3xl">{a.e}</span>
              {a.t.toUpperCase()}
            </button>
          ))}
        </nav>
      </div>
    </main>
  );
}
