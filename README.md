# Vila Verde

Protótipo de um jogo de construção 3D com Three.js e WebGL. A vila fica em
uma clareira plana, cercada por uma floresta gerada conforme você explora.

## Rodar localmente

```sh
npm install
npm run dev
```

Com o MongoDB local em execução, abra o endereço que o Vite mostrar no terminal.
O servidor do jogo usa `mongodb://127.0.0.1:27017`, banco `vila_verde` e coleção
`villages`. Use `MONGODB_URI` e `MONGODB_DATABASE` no ambiente ou em `.env.local`
se precisar alterar a conexão.

No Windows, confirme que o serviço **MongoDB** está iniciado. Se executar
`npm run dev` ou `npm run preview` pelo Ubuntu/WSL e o MongoDB estiver apenas
no Windows, o inicializador usa o Node.js LTS instalado no Windows para acessar
o mesmo banco. Isso também funciona com versões instaladas pelo NVM. Se precisar
escolher o executável, defina `VILLAGE_WINDOWS_NODE=C:/caminho/node.exe` em
`.env.local`. Um MongoDB disponível dentro do WSL continua sendo usado normalmente;
conexões remotas configuradas em `MONGODB_URI` também são preservadas.

A vila e o horário são compartilhados entre os navegadores que acessam esse
servidor local. Para importar o progresso antigo, abra o jogo no mesmo perfil
do navegador e endereço de antes. A importação só preenche os dados que ainda
faltarem no MongoDB.

Para gerar e abrir o build local com salvamento, use `npm run build` e
`npm run preview`. O servidor do jogo fornece a API em desenvolvimento e no preview.

## Jogar

- Arraste com o botão esquerdo para girar a câmera. Use o botão direito ou
  WASD para explorar a floresta e a roda do mouse para ajustar o zoom.
  Pressione **Home** para voltar à clareira.
- Use **Estender** (**1**) e escolha um lado para liberar uma faixa de 36 m
  (três lotes de profundidade). Você pode ampliar cada lado até oito vezes.
  A área liberada fica plana e pode receber ruas, construções e decorações.
  As expansões são salvas no MongoDB. **Ctrl+Z** desfaz a última ação.
- Escolha **Caminhar** (tecla **4**) para passear em primeira pessoa. Use **WASD**
  ou as setas, e arraste para olhar ao redor. No celular, segure as setas na
  tela. A **Loja** também funciona durante o passeio e mantém a posição e a
  direção da câmera. Toque em **Caminhar** novamente para voltar à vista aérea.
- Durante a caminhada, pressione **F** ou toque em **Voar** para decolar.
  Use **Espaço** para subir, **Shift** para descer e **WASD** ou as setas para
  se mover. No celular, use os botões de altura. Arraste para ver o céu ou
  olhar para a vila. Pressione **F** de novo ou toque em **Pousar** para voltar ao chão.
- O terreno inicial tem **360 × 360 m**. Use **Estender** (tecla **1**) para
  aumentar a largura e o comprimento em **180 m** por expansão: são 90 m a mais
  em cada borda. Repita quando precisar; o tamanho fica salvo com a vila,
  sem mover construções, ruas ou a câmera durante o passeio.
- Abra a **Loja** para escolher construções. Clique num lote livre para construir.
  Em uma tela de toque, escolha o lote e toque em **Confirmar**.
- Em primeira pessoa, mire no chão e clique para construir ou use **Enter**
  com a mira central. Arraste para olhar sem colocar uma peça. No celular,
  toque no local e confirme. **Esc** ou **Cancelar** encerra a colocação e
  mantém a caminhada; outro **Esc** sai do passeio. As colisões se atualizam
  depois de construir, mover, excluir ou desfazer.
- Em **Loja → Iluminação**, escolha um dos seis postes e instale-o na calçada
  ou num espaço livre. Continue instalando o mesmo modelo sem reabrir a Loja;
  **Esc** ou **×** encerra. Os postes usam uma grade de 1 m.
- Em **Loja → Calçadas**, escolha concreto, pedra portuguesa, tijolinho
  terracota ou lajota grafite. Encaixe blocos de **2 × 2 m** em áreas verdes
  para criar caminhos ou praças. Postes, bancos, floreiras e outras decorações
  ficam apoiados na calçada, e dá para passar por ela no modo **Caminhar**.
  Casas, prédios, monumentos e comércios podem ser assentados sobre os blocos.
  A construção fica apoiada sobre as calçadas colocadas antes. Os blocos
  continuam visíveis nas áreas livres, sem uma camada de gramado por cima.
  Para pavimentar um jardim existente, coloque os blocos nos espaços livres.
  Mudar um bloco ou construção de lugar conta como nova colocação.
- Para criar uma **linha de calçada**, selecione o modelo, use **Shift+clique**
  no primeiro ponto e clique no ponto final. A linha preenche os blocos de 2 m,
  inclusive na diagonal, pulando paredes, asfalto, blocos existentes e áreas
  proibidas. A prévia marca os espaços livres em verde, os bloqueados em vermelho
  e os que excedem o saldo em amarelo. Só os blocos colocados são cobrados;
  **Ctrl+Z** desfaz a linha inteira e devolve as moedas. **Esc** cancela o início
  marcado. Funciona na vista aérea e em primeira pessoa.
- Em **Loja → Iluminação → Bloco de luz livre**, coloque apenas a luz: o
  cubinho de 18 cm é um marcador, sem poste, e não bloqueia construções ou
  caminhada. O marcador respeita paredes e aparece apenas até 36 m; a luz
  continua funcionando normalmente, mesmo quando o cubo não aparece.
  Clique em telhados, paredes ou no chão; a prévia se apoia na
  superfície. Use **Altura da luz**, **−/+** ou **Page Up/Page Down** para
  subir ou descer em passos de 25 cm (**Shift** ajusta 1 m pelo teclado).
  A altura vai de −20 a 100 m, permite luzes dentro ou abaixo dos objetos e
  fica salva no MongoDB. Selecione o marcador para alterar a altura, mover ou
  excluir; **Ctrl+Z** desfaz. Funciona também em primeira pessoa e no toque.
- Clique ou toque em uma construção para **Mover**, girar em passos de 90°
  com **↺** e **↻**, ou **Excluir**.
- Em **Loja → Decorações**, escolha as 20 peças de jardim, praça, lazer e
  estilo rústico, mais **12 árvores** e **6 canteiros**. Decorações podem
  ocupar os espaços vazios dentro dos lotes, entre casas, nas calçadas e nas
  ruas. A colisão considera as construções reais, e as setas ajustam **25 cm**.
  **R** gira, **Esc** encerra, e a posição fica salva com a vila.
- No filtro **Canteiros**, escolha um bloco e coloque no meio da rua. Depois,
  em **Árvores**, escolha uma espécie e clique na terra do canteiro. As árvores
  apoiam na altura correta, permitem várias unidades nos módulos longos e
  continuam plantadas ao reabrir a vila. As copas podem se sobrepor; a área de
  plantio considera o tronco. Os canteiros podem ser girados em passos de 90°.
- As **setas** ajustam o lote, **R** gira à direita e **Shift+R** gira à
  esquerda. **Enter** confirma, **Esc** cancela, **Delete** exclui a construção
  selecionada e **Ctrl+Z** desfaz a última ação.
- Uma vila nova começa com quatro casas, incluindo a **Casa Oriental**, e seis
  postes. Em vilas salvas, os modelos estão disponíveis na loja.

## Ruas e lotes

- Abra **Ruas** (tecla **3**) e coloque blocos de 12 × 12 m na grade. O asfalto e
  as calçadas se conectam automaticamente em retas, curvas e cruzamentos.
- Os contornos ao lado da rua demarcam os lotes. Ao escolher um modelo na Loja,
  a prévia se encaixa no lote demarcado. A **Casa Oriental**, a **Casa Sakura**,
  a **Igreja das Cúpulas** e o **Posto de Gasolina GS** ocupam quatro lotes
  livres em um quadrado de **24 × 24 m**.
- O **Palácio Oriental**, em **Loja → Monumentos**, tem cerca de **21 m de altura**
  e ocupa seis lotes livres em uma área de **36 × 24 m**. Para girar um palácio
  já construído, confirme a nova posição da área girada.
- **A Convergência**, em **Loja → Monumentos**, reserva **72 × 72 m**. Uma esfera
  de plasma fica suspensa entre três anéis que giram e um feixe sobe até
  **640 m** no jogo, passando pela coroa a **40,5 m**. A praça tem três acessos,
  jardins e cascatas animadas. A opção de movimento reduzido fixa os efeitos
  em uma pose.
- A **Roda-Gigante Estrela da Vila**, em **Loja → Monumentos**, ocupa **36 × 24 m**
  e tem cerca de **35 m** de altura. As 16 cabines se mantêm na vertical
  durante a volta de 58 segundos. A praça tem bilheteria, fila e iluminação
  noturna.
- O **Residencial Aurora**, em **Loja → Prédios**, ocupa quatro lotes de
  **24 × 24 m**. O edifício tem térreo, seis pavimentos residenciais, varandas,
  terraço com pergolado e cobertura com abertura circular. As proporções foram
  aproximadas a partir das imagens de referência; a altura é de cerca de 24 m.
- A **Torre Mirante Oriental**, em **Loja → Prédios**, ocupa **24 × 24 m** e tem
  cerca de **40 m** de altura. Tem dez pavimentos de varandas, fachada com faixa
  em S e lótus iluminados, terraço oval, cerejeiras e duas cascatas no térreo.
- O **Edifício Orion**, em **Loja → Prédios**, tem **56 m** de altura e um
  terreno modelado de **40 × 30 m**. Reserva **48 × 36 m** na grade da vila
  para o térreo comercial, doze pavimentos, terraços e piscina na cobertura.
- A **Torre LexCorp**, em **Loja → Prédios**, tem aproximadamente **180 m** de
  altura e ocupa **48 × 48 m** (16 lotes). Reproduz os volumes curvos de vidro,
  os coroamentos diagonais, a faixa em espiral, o emblema e o letreiro.
  O helicóptero acelera os rotores, decola, sobrevoa os bairros e retorna para
  pousar no heliponto. O patrulhamento começa perto de 38 m de altura, sobe
  localmente sobre os telhados mais altos e contorna os grandes arranha-céus.
  Um refletor sob a cabine varre as ruas: tem facho visível e ilumina as
  superfícies, com maior destaque à noite. Após o pouso, os rotores desaceleram
  e o ciclo recomeça. A torre
  pode ser girada ou movida; o pouso acompanha a nova posição. Uma faixa de luz
  percorre a fachada. As janelas acendem à noite. A opção de movimento reduzido
  pausa a animação. A câmera permite afastamento suficiente para a torre inteira.
  Como sede empresarial, oferece 240 vagas de trabalho na economia da vila.
- A **Casa Cubo Verde**, em **Loja → Casas**, ocupa **24 × 24 m**. Tem três
  níveis, fachadas envidraçadas, terraços, revestimento de madeira e um jardim
  sobre a ala de dois pavimentos. A reprodução usa proporções aproximadas da
  imagem de referência, com um lote modelado de 20 × 20 m.
- A **Casa Belle Époque**, em **Loja → Casas**, ocupa **24 × 24 m** e reproduz
  a referência com telhados cruzados, sótão, duas chaminés, janelas salientes
  arredondadas, arcos, balaustradas e escadarias. As medidas são aproximadas.
- O **Supermercado Verde**, em **Loja → Comércios**, ocupa nove lotes de
  **36 × 36 m**. Inclui salão de vendas com gôndolas abastecidas e caixas,
  café com mesas e máquina de café, três caixas eletrônicos, portas de vidro,
  estacionamento, carrinhos, totem e uma área de serviço nos fundos.
  A fachada verde e o letreiro foram modelados a partir das referências,
  com dimensões aproximadas.
- O **Pavilhão Rotunda**, em **Loja → Monumentos**, ocupa um lote. A base
  circular tem 11,4 m de diâmetro e a altura é de aproximadamente 10,12 m.
  Tem doze colunas caneladas e afuniladas, capitéis com volutas, três degraus,
  piso com medalhão, cornija denticulada e uma cúpula oca com painéis internos.
  Luzes discretas iluminam as colunas à noite.
- Fora do modo de construção, selecione um trecho de rua e use **Mover** ou **Excluir**.
  **Esc** cancela a mudança e **Ctrl+Z** restaura o bloco no local anterior.
  Em **Ruas**, use **Remover** para retirar vários trechos seguidos.
  Ao excluir uma rua, os postes permanecem e se ajustam à superfície restante.
  As ruas ficam salvas no MongoDB local.

## Horário da vila

Use o menu **Horário** para escolher manhã, meio-dia, fim de tarde ou noite.
A luz e a direção das sombras ficam fixas no horário escolhido. À noite, as
janelas acendem e os postes e lanternas iluminam as superfícies próximas.
O MongoDB guarda o último horário selecionado.

## Economia e trânsito

Casas e prédios abrigam moradores de acordo com a capacidade do modelo.
Comércios e serviços oferecem vagas. A arrecadação combina moradores e vagas preenchidas.
O caixa recebe receita a cada 30 segundos com o jogo em primeiro plano.
A vila existente ganha um saldo inicial proporcional à população, com um
mínimo de 2.500 moedas. O saldo fica salvo junto com a cidade no MongoDB.

A Loja mostra os preços antes de construir. Um trecho de rua custa 75 moedas
e uma faixa de expansão custa 1.250. Mover e girar peças já compradas é gratuito.
Excluir não devolve moedas. **Ctrl+Z** devolve o custo ao desfazer uma compra da
sessão atual. Com ruas conectadas e moradores, carros circulam pelas pistas e
pedestres usam as calçadas. Aproxime a câmera ou use **Caminhar** para vê-los.

## Cidade planejada

A versão paisagística em `src/garden-city-plan.js` distribui 47 construções,
44 árvores, 24 canteiros, 83 peças de decoração e 140 postes pelas nove quadras.
Quarenta lotes ficam reservados a jardins, pequenas praças e lazer. O plano
inclui todos os modelos atuais, com fontes, gazebos, áreas de piquenique,
brinquedos, uma praça da igreja e uma alameda de cerejeiras junto ao palácio.

Valide com `node scripts/build-city.js --garden`. Para reconstruir a vila
salva com essa versão, use `node scripts/build-city.js --garden --apply`.
O comando preserva o salvamento anterior em `backups/` antes de gravar.

O plano em `src/city-plan.js` organiza toda a clareira em nove quadras, com
71 casas, seis prédios, 17 comércios, dois monumentos e 110 postes. Os 24
modelos da loja estão representados. As ruas formam uma rede conectada, as
entradas ficam voltadas para a rua e dois miolos de quadra ficam verdes.

Para validar o plano sem mudar o progresso, execute `node scripts/build-city.js`.
Para aplicá-lo à vila local, execute `node scripts/build-city.js --apply` com o
servidor em execução. O endereço padrão é `http://127.0.0.1:5174`; outro endereço
local pode ser passado como argumento. Antes de gravar, o comando cria uma
cópia completa do salvamento anterior em `backups/village-before-city-*.json`.
Se a vila mudar durante a operação, o controle de revisão impede sobrescrevê-la.
O arquivo `backups/city-plan.json` guarda a cidade depois da confirmação no banco.

## Desempenho e qualidade

As construções repetidas usam `InstancedMesh`, com os mesmos vértices, materiais
e texturas. As peças compatíveis são agrupadas uma vez por modelo; seleção,
movimento, giro, animação de construção e desfazer continuam individuais.

A iluminação usa uma grade espacial de 12 m e texturas de dados na GPU.
Cada superfície calcula todas as luzes que podem alcançá-la, incluindo fontes
fora da câmera. Adicionar postes não aumenta o código dos shaders. Os halos
compartilham um desenho, e `compileAsync` prepara os modos de dia e noite.
A floresta guarda anéis inteiros de terreno em cache, evitando recalcular
sombras a cada pequeno movimento da câmera.

A imagem mantém a resolução nativa da tela, antialiasing e filtragem anisotrópica
máxima da GPU. Não há redução automática de resolução ou simplificação dos modelos.

`npm run optimize:models` gera os GLBs em `src/assets/models/optimized/` usando
glTF Transform e Meshoptimizer. Os originais ficam intactos. O processo não
quantiza, simplifica ou altera texturas e verifica a igualdade dos atributos
e dos triângulos após decodificar cada arquivo. Os 12 arquivos processados
ficaram 45% menores; o palácio mantém seu arquivo anteriormente comprimido.

`npm test` executa os testes de dados e renderização. Os cenários de navegador
estão em `tests/village-browser.cjs` e `tests/quality-browser.cjs`, com o servidor
local em `http://127.0.0.1:5174` e Playwright disponível. Eles usam salvamentos
simulados e não modificam a vila do MongoDB.

## Código

- `src/world.js` cria o terreno, a vegetação e o modelo da casa do campo.
- `src/commercial.js` cria os modelos e as fachadas dos comércios.
- `src/assets.js` carrega os modelos do SolidCraft em GLB e as texturas
  exportadas pelo TextureCraft. Os arquivos usados pelo jogo ficam em `src/assets/`.
- `models/posto-gs.sc` é o arquivo editável do posto no SolidCraft.
- `models/casa-oriental.sc` contém a casa e as estruturas do lote no SolidCraft.
  `src/oriental-garden.js` acrescenta os detalhes do jardim e dos telhados no jogo.
- `models/palacio-oriental.sc` contém a arquitetura e os lagos editáveis do
  palácio. O modelo do jogo inclui as telhas, as ornamentações e a vegetação.
- `models/convergencia.sc` contém a praça, os arcos e os anéis editáveis do
  monumento. `src/convergencia-efeitos.js` anima o mini-sol, as órbitas, a
  coroa, o feixe e a água durante o jogo.
- `models/roda-gigante.sc` contém a roda, as cabines e a praça editáveis no
  SolidCraft. `src/roda-gigante.js` monta e anima a roda no jogo.
- `models/residencial-aurora.sc` guarda o prédio editável no SolidCraft, com
  os parâmetros Largura, Profundidade, Pavimento e Andares.
  `src/residencial-aurora.js` prepara os acabamentos, a iluminação das janelas
  e agrupa a geometria exportada para reduzir as chamadas de desenho.
- `models/torre-mirante-oriental.sc` contém a arquitetura editável da torre,
  incluindo o lótus e a faixa em S. `src/mirante-oriental.js` modela a versão
  usada no jogo, com vidro, paisagismo e luzes ligadas ao horário da vila.
- `models/edificio-orion.sc` contém a arquitetura editável do Orion, incluindo
  as faixas orbitais, o coroamento inclinado e o letreiro. A versão em
  `src/edificio-orion.js` acrescenta os acabamentos, os jardins e a iluminação.
- `models/torre-lexcorp.sc` contém a torre e o helicóptero editáveis, com
  os parâmetros Lote e Altura. `src/torre-lexcorp.js` prepara os vidros,
  a iluminação e os grupos de rotores; `src/lexcorp-flight.js` planeja o voo
  pela cidade e a aproximação e o pouso de cada helicóptero.
  `src/lexcorp-searchlight.js` acompanha a aeronave com um holofote e o
  interrompe na primeira fachada ou cobertura atingida.
- `models/casa-cubo-verde.sc` contém a casa moderna editável no SolidCraft.
  `src/casa-cubo-verde.js` prepara o vidro, a madeira e a iluminação noturna;
  o GLB do jogo usa versões leves das copas e arbustos do modelo CAD.
- `models/casa-belle-epoque.sc` contém a casa clássica editável, com telhados
  e arcos definidos por esboços paramétricos. `src/casa-belle-epoque.js`
  prepara os acabamentos e as janelas e lanternas que acendem à noite.
- `models/supermercado-verde.sc` guarda a arquitetura, os móveis e os letreiros
  editáveis no SolidCraft. `src/supermercado-verde.js` prepara as vitrines
  transparentes, os materiais e a iluminação. O modelo da loja mantém a
  geometria de prateleiras, produtos, caixas, equipamentos e carros.
- `models/pavilhao-rotunda.sc` guarda os sólidos paramétricos da rotunda.
  `src/pavilhao-rotunda.js` agrupa os acabamentos e prepara a iluminação;
  o GLB usa uma tesselação mais econômica dos cilindros e toros analíticos.
- `src/placement.js` define a área de construção e valida o progresso salvo.
- `src/main.js` conecta câmera, interface, posicionamento e salvamento.
- `src/walking.js` controla a câmera em primeira pessoa e as colisões da caminhada.
- `src/daylight.js` controla a atmosfera, a iluminação e as janelas.
