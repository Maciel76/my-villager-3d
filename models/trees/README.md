# Árvores da Vila Verde

12 espécies modeladas no SolidCraft via MCP: carvalho, bordo de outono,
ipê-amarelo, ipê-roxo, cerejeira, pinheiro, araucária, cipreste, palmeira,
macieira, laranjeira e salgueiro-chorão.

`trees.sc` contém o histórico editável e o parâmetro `treeScale`. `trees.step`
guarda as formas exatas. O catálogo usa o GLB otimizado de 2,5 MB em
`src/assets/models/optimized/trees.glb` (332 corpos, cerca de 164 mil triângulos).

Execute `node scripts/build-trees.js` para gerar os comandos das três etapas.
Eles podem ser executados em ordem pelo MCP numa pasta permitida. Para gerar
o arquivo independente sem alterar a janela aberta:

```powershell
& 'C:\Program Files\SolidCraft\solidcraft-cli.exe' run models/trees/collection.json --save models/trees/trees.sc --quiet
```

O jogo usa a área do tronco para plantio. A copa pode ultrapassar essa área.
Os modelos apoiam no terreno, nas calçadas, no piso de jardins e na terra
dos canteiros. Posições fracionárias e sobreposições válidas com canteiros
permanecem no mesmo formato de salvamento da vila.

Verificação: `node --test tests/trees.test.js tests/decoration-placement.test.js`
e `python tests/trees-browser.py` (Playwright para Python).
