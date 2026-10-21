<#
  Controle do B.A.R. em desenvolvimento: API (3001), mundo multiplayer (2567) e site (5173).
  Uso: powershell -ExecutionPolicy Bypass -File tools\bar.ps1 <iniciar|parar|reiniciar|status|logs|firewall>
  Os arquivos .bat desta pasta chamam este script; basta abri-los com dois cliques.
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet('iniciar', 'parar', 'reiniciar', 'status', 'logs', 'firewall')]
  [string]$Comando = 'status',
  # Uso interno: recebe a saída da janela de administrador que configura o firewall.
  [string]$Saida
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Raiz = Split-Path -Parent $PSScriptRoot
$Estado = Join-Path $Raiz '.local\tools'
$PidFile = Join-Path $Estado 'bar.pid'
$LogFile = Join-Path $Estado 'bar.log'
$GrupoFirewall = 'B.A.R. - Bar de Buteco'
# O navegador acessa o site e o mundo; a API fica em loopback, atrás do proxy do site.
# O mundo é verificado só pela porta: o /health dele também passa pelo roteador do Colyseus e derruba o processo.
$Servicos = @(
  @{ Nome = 'API';   Porta = 3001; Saude = 'http://127.0.0.1:3001/api/health'; Externa = $false },
  @{ Nome = 'Mundo'; Porta = 2567; Saude = $null;                              Externa = $true },
  @{ Nome = 'Site';  Porta = 5173; Saude = 'http://127.0.0.1:5173/';           Externa = $true }
)

function Escrever([string]$Texto = '', [ConsoleColor]$Cor = 'Gray') {
  Write-Host $Texto -ForegroundColor $Cor
  if ($Saida) { Add-Content -Path $Saida -Value $Texto -Encoding UTF8 }
}

# Processo iniciado por este script; o horário de início evita confundir um PID reutilizado.
function Get-ProcessoPrincipal {
  if (-not (Test-Path $PidFile)) { return $null }
  try {
    $linhas = @(Get-Content $PidFile)
    $processo = Get-Process -Id ([int]$linhas[0]) -ErrorAction Stop
    if ($processo.StartTime.ToString('o') -eq $linhas[1]) { return $processo }
  } catch { }
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  return $null
}

function Get-Escutando([int]$Porta) {
  @(Get-NetTCPConnection -State Listen -LocalPort $Porta -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Test-PortasOcupadas {
  foreach ($servico in $Servicos) { if (@(Get-Escutando $servico.Porta).Count) { return $true } }
  return $false
}

function Test-Saude($Servico) {
  try {
    if (-not $Servico.Saude) {
      $conexao = New-Object Net.Sockets.TcpClient
      try { return $conexao.ConnectAsync('127.0.0.1', $Servico.Porta).Wait(3000) } finally { $conexao.Close() }
    }
    $requisicao = [Net.WebRequest]::Create($Servico.Saude)
    $requisicao.Proxy = $null
    $requisicao.Timeout = 3000
    $requisicao.GetResponse().Close()
    return $true
  } catch { return $false }
}

function Get-InfoProcesso([int]$Id) {
  Get-CimInstance Win32_Process -Filter "ProcessId = $Id" -ErrorAction SilentlyContinue
}

function Test-DoProjeto($Info) {
  ([string]$Info.CommandLine).ToLowerInvariant().Replace('/', '\').Contains($Raiz.ToLowerInvariant())
}

# Sobe enquanto o pai também for deste projeto, para encerrar junto os vigias (tsx watch, concurrently).
function Get-TopoDoProjeto($Info) {
  $atual = $Info
  for ($i = 0; $i -lt 16; $i++) {
    $pai = Get-InfoProcesso ([int]$atual.ParentProcessId)
    if (-not $pai -or -not (Test-DoProjeto $pai) -or $pai.CreationDate -gt $atual.CreationDate) { break }
    $atual = $pai
  }
  return [int]$atual.ProcessId
}

function Encerrar-Arvore([int]$Id) {
  & $env:ComSpec /d /c "taskkill /PID $Id /T /F >nul 2>&1"
}

# Envia Ctrl+C ao console oculto do servidor, como ao fechar o npm run dev num terminal.
# Roda em outro processo porque é preciso se desligar do próprio console para usar o do servidor.
function Enviar-CtrlC([int]$Id) {
  $script = @'
Add-Type -Namespace Bar -Name Console -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool FreeConsole(); [DllImport("kernel32.dll")] public static extern bool AttachConsole(uint id); [DllImport("kernel32.dll")] public static extern bool SetConsoleCtrlHandler(System.IntPtr rotina, bool ignorar); [DllImport("kernel32.dll")] public static extern bool GenerateConsoleCtrlEvent(uint evento, uint grupo);'
[void][Bar.Console]::FreeConsole()
if ([Bar.Console]::AttachConsole(__PID__)) {
  [void][Bar.Console]::SetConsoleCtrlHandler([IntPtr]::Zero, $true)
  [void][Bar.Console]::GenerateConsoleCtrlEvent(0, 0)
  Start-Sleep -Milliseconds 300
}
'@
  $codificado = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script.Replace('__PID__', $Id)))
  Start-Process powershell.exe -ArgumentList "-NoProfile -NonInteractive -EncodedCommand $codificado" -WindowStyle Hidden -Wait
}

function Aguardar-PortasLivres([int]$Segundos) {
  $limite = (Get-Date).AddSeconds($Segundos)
  while ((Get-Date) -lt $limite) {
    if (-not (Test-PortasOcupadas)) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Get-EnderecosRede {
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress
}

function Mostrar-Status {
  Escrever ''
  Escrever 'B.A.R. - status' Cyan
  $principal = Get-ProcessoPrincipal
  if ($principal) { Escrever ('  Em segundo plano desde {0:dd/MM HH:mm} (PID {1}).' -f $principal.StartTime, $principal.Id) }
  $noAr = 0
  foreach ($servico in $Servicos) {
    if (Test-Saude $servico) { $estado = 'no ar'; $cor = 'Green'; $noAr++ }
    elseif (@(Get-Escutando $servico.Porta).Count) { $estado = 'porta ocupada, sem resposta (iniciando?)'; $cor = 'Yellow' }
    else { $estado = 'desligado'; $cor = 'Red' }
    Escrever ('  {0,-6} porta {1}  {2}' -f $servico.Nome, $servico.Porta, $estado) $cor
  }
  if ($noAr -and -not $principal) { Escrever '  Iniciado fora destas ferramentas (por exemplo, npm run dev num terminal).' DarkGray }
  if ($noAr -eq $Servicos.Count) {
    Escrever ''
    Escrever 'Acesse:' Cyan
    Escrever '  Neste computador:  http://localhost:5173'
    foreach ($ip in Get-EnderecosRede) { Escrever "  Pela rede:         http://${ip}:5173" }
    Escrever '  Se outro computador não conseguir abrir, execute liberar-firewall.bat uma vez.' DarkGray
  }
  Escrever ''
  Escrever "Log: $LogFile" DarkGray
}

function Iniciar {
  if ((Get-ProcessoPrincipal) -or (Test-PortasOcupadas)) {
    Escrever 'O B.A.R. já está em execução (ou alguma das portas está ocupada).' Yellow
    Mostrar-Status
    return
  }
  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node.js não encontrado. Instale o Node.js 24 (https://nodejs.org) e tente novamente.' }
  if (-not (Test-Path (Join-Path $Raiz 'node_modules'))) {
    Escrever 'Instalando as dependências (npm install); isso só acontece na primeira vez...' Cyan
    Push-Location $Raiz
    try { & npm.cmd install } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'npm install falhou; veja as mensagens acima.' }
  }

  New-Item -ItemType Directory -Force -Path $Estado | Out-Null
  if (Test-Path $LogFile) { Move-Item $LogFile (Join-Path $Estado 'bar.anterior.log') -Force }
  Escrever 'Ligando o B.A.R. em segundo plano...' Cyan
  $env:NO_COLOR = '1'
  $processo = Start-Process -FilePath $env:ComSpec -ArgumentList "/d /c npm.cmd run dev 1> `"$LogFile`" 2>&1" -WorkingDirectory $Raiz -WindowStyle Hidden -PassThru
  Set-Content -Path $PidFile -Value @($processo.Id, $processo.StartTime.ToString('o')) -Encoding ASCII

  $limite = (Get-Date).AddSeconds(120)
  while (@($Servicos | Where-Object { Test-Saude $_ }).Count -lt $Servicos.Count) {
    if ($processo.HasExited -or (Get-Date) -gt $limite) {
      Escrever 'O B.A.R. não ficou pronto. Últimas linhas do log:' Red
      if (Test-Path $LogFile) { Get-Content $LogFile -Tail 25 -Encoding UTF8 | ForEach-Object { Escrever "  $_" DarkGray } }
      if ($processo.HasExited) { Remove-Item $PidFile -Force -ErrorAction SilentlyContinue; throw "O processo terminou. Log completo: $LogFile" }
      throw 'Ainda não respondeu após 2 minutos. Acompanhe com logs.bat ou desligue com parar.bat.'
    }
    Start-Sleep -Seconds 2
  }
  Escrever 'B.A.R. ligado!' Green
  Mostrar-Status
}

function Parar {
  $encerrou = $false
  $principal = Get-ProcessoPrincipal
  if ($principal) {
    Escrever 'Desligando o B.A.R....' Cyan
    Enviar-CtrlC $principal.Id
    if (-not (Aguardar-PortasLivres 20)) { Escrever 'Os serviços não encerraram a tempo; forçando o encerramento.' Yellow }
    Encerrar-Arvore $principal.Id
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    $encerrou = $true
  }
  # O que ainda ocupa as portas, por exemplo um npm run dev aberto num terminal.
  $forcados = $false
  foreach ($servico in $Servicos) {
    foreach ($id in @(Get-Escutando $servico.Porta)) {
      $info = Get-InfoProcesso $id
      if (-not $info) { continue }
      if (Test-DoProjeto $info) {
        Escrever "Encerrando $($servico.Nome) iniciado fora destas ferramentas (PID $id)." Yellow
        Encerrar-Arvore (Get-TopoDoProjeto $info)
        $encerrou = $forcados = $true
      } else {
        Escrever "A porta $($servico.Porta) está em uso por outro programa ($($info.Name), PID $id); ele não foi encerrado." Yellow
      }
    }
  }
  if ($forcados) { [void](Aguardar-PortasLivres 10) }
  if ($encerrou) { Escrever 'B.A.R. desligado.' Green } else { Escrever 'O B.A.R. já estava desligado.' Green }
}

function Liberar-Firewall {
  $administrador = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $administrador) {
    New-Item -ItemType Directory -Force -Path $Estado | Out-Null
    $arquivo = Join-Path $Estado 'firewall.txt'
    Remove-Item $arquivo -Force -ErrorAction SilentlyContinue
    Escrever 'Pedindo permissão de administrador para configurar o firewall...' Cyan
    try {
      $elevado = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" firewall -Saida `"$arquivo`""
    } catch { throw 'Permissão de administrador negada; o firewall não foi alterado.' }
    if (Test-Path $arquivo) { Get-Content $arquivo -Encoding UTF8 | ForEach-Object { Escrever $_ } }
    if ($elevado.ExitCode -ne 0) { exit 1 }
    return
  }

  Get-NetFirewallRule -Group $GrupoFirewall -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  foreach ($servico in $Servicos | Where-Object { $_.Externa }) {
    New-NetFirewallRule -DisplayName "$GrupoFirewall - $($servico.Nome) (TCP $($servico.Porta))" -Group $GrupoFirewall `
      -Direction Inbound -Action Allow -Protocol TCP -LocalPort $servico.Porta -Profile Domain, Private | Out-Null
    Escrever "Liberada a entrada na porta TCP $($servico.Porta) ($($servico.Nome)) em redes privadas e de domínio." Green
  }
  # Cancelar o aviso do Windows na primeira execução do Node.js cria bloqueios, que vencem as liberações acima.
  $bloqueios = @(Get-NetFirewallRule -Direction Inbound -Action Block -Enabled True -ErrorAction SilentlyContinue |
    Where-Object { ($_ | Get-NetFirewallApplicationFilter).Program -like '*\node.exe' })
  foreach ($regra in $bloqueios) {
    Disable-NetFirewallRule -Name $regra.Name
    Escrever "Desativada a regra '$($regra.DisplayName)', que bloqueava o Node.js." Yellow
  }
  $publicas = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Public' })
  if ($publicas.Count) {
    $nomes = ($publicas | ForEach-Object { $_.InterfaceAlias }) -join ', '
    Escrever "Atenção: a rede '$nomes' está como Pública e continua bloqueada. Marque-a como Privada em Configurações > Rede e Internet." Yellow
  }
  Escrever 'Firewall configurado.' Green
}

try {
  switch ($Comando) {
    'iniciar'   { Iniciar }
    'parar'     { Parar }
    'reiniciar' { Parar; Iniciar }
    'status'    { Mostrar-Status }
    'logs'      {
      if (-not (Test-Path $LogFile)) { Escrever 'Ainda não há log. Ligue o servidor com iniciar.bat.' Yellow; break }
      Escrever "Acompanhando $LogFile (Ctrl+C para sair)" Cyan
      Get-Content -Path $LogFile -Tail 80 -Wait -Encoding UTF8
    }
    'firewall'  { Liberar-Firewall }
  }
  exit 0
} catch {
  Escrever "ERRO: $($_.Exception.Message)" Red
  exit 1
}
