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
- Escolha **Caminhar** (tecla **4**) para passear em primeira pessoa. Use **WASD**
  ou as setas, e arraste para olhar ao redor. No celular, segure as setas na
  tela. Escolha **Explorar** ou pressione **Esc** para sair do passeio.
- Abra a **Loja** para escolher construções. Clique num lote livre para construir.
  Em uma tela de toque, escolha o lote e toque em **Confirmar**.
- Em **Loja → Iluminação**, escolha um dos seis postes e instale-o na calçada
  ou num espaço livre. Os postes usam uma grade de 1 m.
- Clique ou toque em uma construção para **Mover**, girar em passos de 90°
  com **↺** e **↻**, ou **Excluir**.
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
- Use **Remover** para retirar trechos de rua. Um poste sobre a calçada pode
  precisar ser movido antes de alterar o cruzamento. **Ctrl+Z** desfaz a última
  ação. As ruas ficam salvas no MongoDB local.

## Horário da vila

Use o menu **Horário** para escolher manhã, meio-dia, fim de tarde ou noite.
A luz e a direção das sombras ficam fixas no horário escolhido. À noite, as
janelas acendem e os postes e lanternas iluminam as superfícies próximas.
O MongoDB guarda o último horário selecionado.

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
- `src/placement.js` define a área de construção e valida o progresso salvo.
- `src/main.js` conecta câmera, interface, posicionamento e salvamento.
- `src/walking.js` controla a câmera em primeira pessoa e as colisões da caminhada.
- `src/daylight.js` controla a atmosfera, a iluminação e as janelas.
