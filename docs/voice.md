# Chat de voz por proximidade

Cada jogador decide se liga o microfone e se ouve os outros. Quem estiver a até **15 m** ouve a voz: volume cheio até 2 m, caindo suavemente até sumir aos 15 m, com o lado (esquerdo/direito) relativo à câmera. Andares contam na distância.

## Controles

| Onde | O quê |
| --- | --- |
| Botão de microfone no topo, ou **M** | Liga e desliga o microfone. A barrinha sob o ícone mostra o nível; o botão brilha enquanto você transmite. |
| Botão de fones no topo | Ouvir ou silenciar todas as vozes. Desligado, o servidor deixa de enviar voz para você. |
| **Configurações** (ícone de controles no topo) | Volumes (geral, música ambiente, jukebox e TV, vozes), microfone, ouvir outras pessoas, modo de transmissão, sensibilidade, volume e dispositivo do microfone, com medidor de nível. |
| Ao detectar voz | Transmite quando o nível passa da marca de sensibilidade no medidor e segura 350 ms depois da última palavra. |
| Segurando **B** | Modo apertar para falar. (T e Enter abrem o chat; V acena.) |
| Pessoas por perto | **Silenciar voz** de uma pessoa só para você. **Bloquear** também corta a voz, nos dois sentidos. |

Os rótulos sobre os personagens mostram um microfone para quem o ligou e acendem em verde enquanto a pessoa fala. As preferências ficam salvas no navegador; o microfone volta ligado ao entrar no bar se o navegador já tiver dado a permissão.

## Como funciona

O navegador captura o microfone com cancelamento de eco, redução de ruído e controle automático de ganho. Um AudioWorklet reamostra para 48 kHz em quadros de 20 ms, que são codificados em **Opus** a 24 kbit/s (WebCodecs) e enviados em pacotes de 40 ms pela própria conexão do jogo. Sem codificador Opus, o navegador envia μ-law a 16 kHz.

O servidor não decodifica o áudio. Ele repassa cada pacote apenas a quem está conectado, a até 15 m, com a opção de ouvir ligada e sem bloqueio entre os dois; limita a 40 pacotes por segundo por pessoa e descarta pacotes malformados. A voz não é gravada. Quem recebe decodifica, aplica um buffer de 120 ms contra variações da rede e posiciona a voz pela distância e pela câmera.

Formato, curva de volume e codificação estão em `packages/shared/src/voice.ts`; o cliente em `apps/web/src/voice.ts`; o repasse em `BarRoom.relayVoice`.

## HTTPS

O navegador só libera o microfone em páginas seguras: `https://` ou `localhost`. Por isso o site de desenvolvimento roda em **HTTPS** com um certificado próprio (`@vitejs/plugin-basic-ssl`). Na primeira visita o navegador avisa que o certificado não é confiável: clique em *Avançado* e continue. O jogo é acessado pelo mesmo endereço (`/game`, repassado pelo Vite ao servidor do mundo), porque uma página `https://` não pode abrir `ws://` em outra porta. Para quem acessa de fora, basta a porta **5173**.

`BAR_HTTPS=0` volta ao HTTP (os testes de navegador usam assim, em `localhost`, onde o microfone funciona sem HTTPS).

## Testes

- `tests/integration/voice.test.ts`: formato dos pacotes, μ-law e curva de volume.
- `apps/server/test/voice.integration.test.ts`: conexões reais, com microfone desligado, alcance, bloqueio, opção de ouvir, pacotes inválidos, limite por segundo e saída.
- `tests/e2e/voice.spec.ts` (projeto `voice` do Playwright, microfone simulado do Chromium): dois jogadores, Opus, reprodução perto e alta, rótulo falando, silenciar todos e uma pessoa, apertar para falar com B e desligar com M.
