# Som ambiente

Ao entrar no bar, o navegador toca discretamente as gravações de `assets-bar/sound/ambient`. A entrada tem fade; a ordem é embaralhada, passando por todas as gravações antes de repetir, sem repetição imediata na virada da lista. Os sons são locais a cada jogador.

Foram importadas **seis gravações**, com aproximadamente 23 minutos e 39 segundos no total. A cópia `(1)` é idêntica ao arquivo sem sufixo e entra uma única vez. Os originais foram preservados. Os M4A originais contêm ALAC; as versões públicas usam AAC-LC, 48 kHz e 96 kbit/s, com aproximadamente 17 MB no total.

## Mixagem e controles

- Transições de potência constante com sobreposição de até **12 segundos**. Em arquivos curtos ou carregamentos tardios, o tempo diminui conforme o áudio disponível. Se a próxima gravação não estiver disponível a tempo, a atual termina em fade e a próxima entra gradualmente ao carregar.
- Normalização offline em duas passagens, alvo −24 LUFS, pico verdadeiro −6 dBTP e faixa de loudness 7 LU. A codificação AAC pode alterar ligeiramente o pico final.
- Barramento ambiente com ganho máximo **0,18**, multiplicado por **Geral × Som ambiente** nas configurações. O nível médio medido das versões AAC fica entre −21,4 e −23 dBFS antes desse ganho; o fundo final fica perto de −36 a −38 dBFS, sujeito ao conteúdo e aos filtros.
- Filtro passa-altas em 65 Hz para reduzir ruído grave de manuseio. O ambiente diminui suavemente para **30%** do seu nível enquanto há uma seleção na jukebox, inclusive pausada. Ao desligar a TV, volta gradualmente ao nível normal.
- O botão de som do topo liga/desliga ambiente e jukebox; a preferência de ambiente fica salva neste navegador. O chat de voz mantém controles independentes.
- Ocultar a aba pausa a reprodução após um fade breve. Voltar retoma com fade. Sair do bar ou perder a conexão silencia e libera as mídias; a reconexão retoma o ambiente.

O clique para entrar libera o áudio conforme a política do navegador. Se o navegador ainda bloquear a reprodução, o sistema tenta novamente na próxima interação real. Falhas em uma gravação fazem o sistema pular para outra; todos os arquivos indisponíveis deixam o ambiente silencioso sem uma sequência de requisições de erro. A indisponibilidade do ambiente não impede jogar.

São usados dois elementos de áudio transmitidos pelo navegador, com ganhos Web Audio. Apenas a gravação atual e, perto da troca, a próxima ficam carregadas. A lista completa não é decodificada para buffers em memória. Não há áudio sintetizado de festa nem requisições a serviços externos para o ambiente.

## Reimportar gravações

Adicione arquivos M4A, MP3, WAV, OGG ou FLAC na pasta original. Com FFmpeg disponível no PATH:

```powershell
npm run assets:ambient
```

Ou informe o executável:

```powershell
npm run assets:ambient -- "C:\caminho\ffmpeg.exe"
```

`FFMPEG_PATH` também é aceito. O FFmpeg é necessário apenas para preparar arquivos novos/alterados; o jogo usa os AAC já publicados. A primeira importação desta implementação utilizou uma cópia local de FFmpeg em `.local/ambient-tools/package/ffmpeg.exe`, fora dos arquivos distribuídos.

O script `tools/import-ambient.mjs` elimina duplicatas por SHA-256, normaliza, converte, publica em `apps/web/public/audio/ambient` e atualiza `apps/web/src/assets/ambient.json`. Importações sem alterações reutilizam os arquivos existentes. Arquivos antigos deixam de constar da lista quando removidos da origem; o script preserva cópias públicas antigas, que não são mais tocadas.

## Validação

`tests/integration/ambient.test.ts` verifica embaralhamento, falhas, curvas de potência constante e presença dos seis arquivos publicados. `tests/e2e/ambient.spec.ts` testa a decodificação AAC real, saída de áudio, transição com duas gravações, redução para jukebox, visibilidade, preferência de mute, falha de arquivo, configurações dentro do jogo e liberação ao voltar à entrada.

Em desenvolvimento, `barDebug.ambient()` fornece um diagnóstico somente de leitura: faixas, tempos, ganhos, contexto, transição e falhas. Os ajustes principais ficam em `apps/web/src/ambient-mix.ts`.
