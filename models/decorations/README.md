# Decorações da Vila Verde

Coleção de 20 modelos criada no SolidCraft aberto pelo MCP. São 631 corpos
fechados, com nomes e acabamentos individuais. O arquivo `decorations.sc`
contém apenas a coleção, com histórico editável e o parâmetro `decorScale`.
O STEP preserva a geometria exata; o GLB usado no jogo fica em
`src/assets/models/optimized/decorations.glb`.

Os modelos são separados no carregamento, centralizados e apoiados no chão.
Cada um tem área própria para posicionar e girar, sem reservar um lote inteiro.
A fogueira também participa da iluminação noturna da vila.

## Reproduzir os arquivos

1. Execute `node scripts/build-decorations.js` na raiz do projeto.
2. Pelo MCP, execute os comandos de `stage-1.json` a `stage-4.json` em ordem,
   em um documento vazio. Os arquivos precisam estar em uma pasta permitida
   pelo servidor MCP. As expectativas de cada etapa estão junto dos comandos.
3. Ou gere o documento independente, sem alterar o aplicativo aberto:

   ```powershell
   & 'C:\Program Files\SolidCraft\solidcraft-cli.exe' run models/decorations/collection.json --save models/decorations/decorations.sc --quiet
   ```

4. Exporte a coleção para GLB pelo SolidCraft e execute:

   ```sh
   node scripts/optimize-decorations.js caminho/do/export.glb
   ```

`manifest.json` lista as peças e suas posições na bancada CAD. Os relatórios
`cad-verification.json` e `optimization.json` guardam a medição e a redução
da malha. A medição coincide com o volume calculado, sem corpos abertos.

## Verificação

- `node --test tests/*.test.js`: testes de encaixe, giro, ruas, modelos e saves.
- `python tests/decorations-browser.py`: loja, filtros, prévias, colocação,
  movimento, desfazer, recarregamento, iluminação e menu de celular, usando
  um save isolado. Requer Playwright para Python (o script também procura
  a instalação temporária usada na criação da coleção).
- `npm run build`: build de produção.

O plano de cidade mantém seus lotes existentes. As decorações ficam disponíveis
na loja para o jogador escolher onde colocá-las.
