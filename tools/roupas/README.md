# Importar roupas masculinas

As roupas atuais já estão instaladas: camiseta, suéter, calça, calça social, tênis, sapato Derby e óculos. Para as próximas peças compatíveis, não é necessário editar o código do jogo ou pedir uma nova integração.

1. Copie os arquivos FBX para `assets-bar/Universal Base Characters[Standard]/Male-Cloth`.
2. Abra **`importar.bat`** nesta pasta e aguarde a mensagem **Pronto**.
3. Recarregue o jogo e abra **C → Personalizar → Corpo masculino**. Confira as peças nos cartões e no personagem antes de salvar.

Pode abrir os scripts com dois cliques, a partir de qualquer pasta. Eles usam Node.js, npm, as dependências instaladas do projeto e o Edge do Windows (ou o canal definido em `PLAYWRIGHT_CHANNEL`). Não executam seed, não alteram contas e não concedem moedas.

| Script | Ação |
| --- | --- |
| `listar.bat` | Mostra os arquivos encontrados, nomes e categorias; não altera o jogo |
| `validar.bat` | Converte e verifica em uma pasta temporária; não instala os resultados |
| `importar.bat` | Converte, valida, faz backup, instala o catálogo/modelos/animações e executa o build |

No terminal, na raiz do projeto:

```powershell
.\tools\roupas\listar.bat --sem-pausa
.\tools\roupas\validar.bat --sem-pausa
.\tools\roupas\importar.bat --sem-pausa
# Alternativa à última linha:
npm.cmd run assets:characters
```

Todos retornam código zero no sucesso e diferente de zero na falha. Só pode haver uma importação por vez. Relatórios, arquivos convertidos e backups ficam em `.local/roupas/<data-id>/`; `.local/roupas/ultima-importacao.json` indica a última instalação concluída. Esses arquivos são locais e não entram no Git.

## Como nomear os arquivos

| Padrão | Categoria | Exemplo |
| --- | --- | --- |
| `Cloth_Male_Top_Nome.fbx` | Blusas | `Cloth_Male_Top_Hoodie.fbx` |
| `Cloth_Male_Bottom_Nome.fbx` | Calças/bermudas | `Cloth_Male_Bottom_Shorts.fbx` |
| `Cloth_Male_Feet_Nome.fbx` | Calçados | `Cloth_Male_Feet_Boots.fbx` |
| `Acc_Male_Face_Nome.fbx` | Acessório do rosto | `Acc_Male_Face_Glasses.fbx` |

O final do nome vira um identificador estável: `New_Hoodie` vira `new-hoodie`. Categorias diferentes precisam de identificadores distintos. Não renomeie nem remova arquivos já instalados sem preservar seu `id`: o importador recusa essa alteração para proteger seleções salvas. Arquivos FBX com nomes desconhecidos geram erro explícito; outros arquivos são ignorados. Cabelos e outros acessórios fora dos padrões acima continuam nos seus próprios importadores.

## O que o script faz

- Descobre as peças da pasta e gera `packages/shared/src/clothing-catalog.json`, compartilhado entre API, servidor, editor e renderização. O menu, a validação e as prévias 3D acompanham esse catálogo.
- Converte a escala e orientação do FBX, transfere os pesos do corpo por proximidade de superfície e usa o esqueleto existente. Acessórios do rosto acompanham rigidamente a cabeça; lentes nomeadas `Glass_Lens` conservam transparência.
- Calcula a cobertura separada por peça, para que mangas longas e curtas possam ocultar regiões diferentes do corpo. Tirar a roupa restaura os triângulos originais.
- Recria os bancos de animação dos dois corpos para manter a hierarquia compatível, preservando as skins completas e seus bancos.
- Recria também os props de bengala e os clipes `/velho` dos dois corpos; mantenha os arquivos `A_Male_Walk_OldCane.fbx` e `A_Male_Walk_OldCane_walkstyle.fbx` em `assets-bar/anim`.
- Valida geometria, encaixe, índices, pesos, materiais, texturas, cobertura e compatibilidade das animações antes de instalar. Publica o catálogo por último. Se a instalação ou o build falhar, restaura os modelos, animações e catálogo anteriores.

Arquivos idênticos são preservados para evitar recargas desnecessárias. Os arquivos temporários de publicação ficam em `.local/roupas`, fora das pastas monitoradas pelo Vite e pelo tsx; isso evita o erro `EBUSY` de monitoramento no Windows.

O modo de desenvolvimento monitora também o JSON compartilhado e recarrega a API e o mundo ao publicar o catálogo. Caso tenha iniciado os serviços antes dessa atualização dos comandos de desenvolvimento, execute `tools/reiniciar.bat` uma vez. Em produção, a nova versão precisa ser implantada/reiniciada pelo processo normal de publicação.

## Encaixe e ajustes opcionais

A automação espera peças preparadas para o **corpo masculino Quaternius Standard, na mesma pose de repouso**, com coordenadas e materiais compatíveis com os arquivos atuais. Ela não adapta automaticamente uma roupa feita para outro corpo ou em outra pose. Texturas externas também não fazem parte deste importador de peças com cores de vértices. A validação geométrica detecta problemas de escala/encaixe; conferir a prévia e as animações continua necessário para avaliar o resultado visual.

Os arquivos atuais usam centímetros e precisam de 180° de rotação em Y. O limite padrão de distância da roupa à superfície do corpo é 6 cm. O suéter é mais folgado na região das costas e já tem uma exceção de 10 cm em **`ajustes.json`**. Não é um deslocamento manual da roupa.

Para mudar o nome exibido ou ajustar um arquivo compatível, edite `ajustes.json` e execute novamente:

```json
{
  "Cloth_Male_Top_Sweater.fbx": {"maxDistance": 0.1},
  "Cloth_Male_Top_Hoodie.fbx": {
    "id": "hoodie",
    "name": "Moletom",
    "scale": 0.01,
    "rotationY": 180,
    "maxDistance": 0.06,
    "roughness": 0.9,
    "metalness": 0
  }
}
```

Inclua somente ajustes de arquivos existentes. `maxDistance` usa metros, `rotationY` usa graus, `roughness` e `metalness` vão de 0 a 1. `coverage: false` desativa a ocultação de pele para uma peça que não deva cobrir o corpo. O limite máximo aceito de distância é 15 cm; aumentar esse limite não corrige escala ou pose incompatível. Após instalar, inclua no controle de versão os FBX, o catálogo JSON e os GLB gerados.
