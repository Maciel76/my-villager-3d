# Canteiros para ruas e jardins

Seis modelos criados pelo MCP do SolidCraft, com solo plano e bordas de concreto:
quadrado, retangular, circular, central longo, ilha arredondada e duplo.
O arquivo `planting-beds.sc` guarda o histórico e o parâmetro `bedScale`.
O GLB do jogo ocupa cerca de 132 KB; o projeto tem 56 corpos sólidos.

`node scripts/build-planting-beds.js` gera `collection.json`, pronto para
reproduzir pelo MCP (em pasta permitida) ou pelo `solidcraft-cli run`.

Cada modelo declara sua altura de terra e as regiões onde os troncos podem
ficar em `src/planting-bed-types.js`. A mesma regra verifica construção,
movimento, rotação, prévia, sobreposição e leitura do save, nas duas ordens
de criação. Canteiros podem ocupar os módulos de rua. As árvores clicadas
sobre eles apoiam no solo elevado, sem afundar no asfalto.

Verificação: `node --test tests/planting-beds.test.js` e
`python tests/trees-browser.py`. Os testes de navegador usam uma vila isolada.
