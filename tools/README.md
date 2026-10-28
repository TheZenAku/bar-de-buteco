# Iniciar e controlar o B.A.R. no Windows

Os arquivos podem ser abertos com dois cliques, a partir de qualquer pasta. É necessário Node.js 24 com npm disponível no PATH. Os serviços rodam em segundo plano; a janela pode ser fechada depois da confirmação de início.

| Arquivo | Ação |
| --- | --- |
| `iniciar.bat` | Liga API, mundo multiplayer e site |
| `reiniciar.bat` | Encerra os processos do projeto e inicia novamente |
| `parar.bat` | Desliga os serviços do projeto |
| `status.bat` | Verifica os serviços e mostra os endereços |
| `logs.bat` | Acompanha o log; Ctrl+C encerra o acompanhamento |
| `liberar-firewall.bat` | Configura acesso pela rede privada; solicita administrador |
| `abrir-jogo.bat` | Abre https://localhost:5173 no navegador padrão (com `BAR_HTTPS=0`, o endereço HTTP) |
| `atualizar.bat` | Para os serviços, executa `npm install` e o typecheck e liga tudo de novo; se algo falhar, os serviços ficam desligados e o erro aparece na janela |
| `testar.bat` | Executa `npm test` (API, mundo e integração); `testar.bat navegador` também executa os E2E no Edge |
| `contas-demo.bat` | Para os serviços, cria as contas de demonstração (`npm run seed`) e liga tudo de novo; o PostgreSQL embutido aceita um processo por vez |

Abra **https://localhost:5173** depois de aparecer **B.A.R. ligado!** (na primeira visita, aceite o aviso do certificado próprio em *Avançado*; o HTTPS libera o microfone do [chat de voz](../docs/sistemas/voice.md)). As portas são 3001 para a API, 2567 para o mundo e 5173 para o site; o site repassa o mundo em `/game`, então quem joga de fora só precisa da porta 5173. Com `BAR_HTTPS=0` no ambiente, o site volta a usar HTTP. O status consulta a identidade da API e do mundo e verifica a transformação do código e do CSS no Vite, além da página inicial.

Se a execução estiver incompleta, use `reiniciar.bat`. Processos de outros programas que ocupem essas portas são informados e não são encerrados. As ferramentas não executam seed nem apagam contas ou dados do jogo.

Os comandos de desenvolvimento da API e do mundo também monitoram explicitamente `packages/shared/src/**/*.{ts,json}`, incluindo TypeScript e JSON. Assim, alterações nos contratos compartilhados e nos dados JSON, como o mapa, recarregam os dois serviços; sem isso, o cliente podia atualizar enquanto a API continuava rejeitando os campos novos. Após atualizar os próprios comandos `dev`, execute `reiniciar.bat` uma vez para ativar o novo monitoramento.

Antes de iniciar, o script verifica Node/npm, dependências essenciais e marcadores de conflito de merge no código. Se houver conflito, informa o arquivo e a linha e termina com erro. Um `git status` limpo não garante ausência de marcadores salvos em um commit.

Os logs ficam em `.local/tools/bar.log`; a execução anterior fica em `.local/tools/bar.anterior.log`. O PID e seu horário de criação ficam em `.local/tools/bar.pid`, para evitar confundir um processo antigo com outro que reutilizou seu número.

Em um terminal, o controle também pode ser chamado diretamente:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\bar.ps1 iniciar
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\bar.ps1 status
```

Para automação, os `.bat` aceitam `--sem-pausa` e devolvem o código de saída do PowerShell:

```powershell
.\tools\iniciar.bat --sem-pausa
.\tools\reiniciar.bat --sem-pausa
.\tools\parar.bat --sem-pausa
```

Verificado em 22/10/2026: início fora da pasta do projeto, início repetido sem duplicar processos, reinício, parada com liberação das três portas, rejeição de conflito de merge com código 1 e preservação de outro programa ocupando uma porta. O build e os 39 testes de API, servidor e integração também passaram após a correção dos conflitos que impediam a execução.

## Outras ferramentas

| Pasta | Conteúdo |
| --- | --- |
| `assets/` | Importadores que geram os arquivos de `apps/web/public` a partir de `assets-bar` (chamados pelos scripts `npm run assets:*`), e a biblioteca comum em `assets/lib` |
| `ops/` | Backup e restore-check do PostgreSQL (`npm run ops:backup`, `npm run ops:restore-check`) e `pseudonym.mjs`, que acha um jogador nos logs |

Para trocar os ícones dos itens ou da moeda, substitua a imagem em `assets-bar/icons` (mesmo nome) e execute `npm run assets:icons`. A tabela no início de `assets/import-icons.mjs` liga cada arquivo ao item. Um item novo precisa de uma linha ali e do caminho `icon` no catálogo (`packages/shared/src/inventory.ts`).

Para atualizar os [sons ambientes](../docs/sistemas/ambient.md), adicione gravações em `assets-bar/sound/ambient` e execute `npm run assets:ambient -- "C:\caminho\ffmpeg.exe"`. O importador normaliza o volume, converte para AAC e elimina duplicatas sem alterar os originais.
