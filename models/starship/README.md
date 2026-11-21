# Base Starship — Porto Aurora

Construção disponível em **Loja → Monumentos**. Ocupa **72 × 60 m (30 lotes)** e custa **8.350 moedas**, conforme a economia normal do catálogo. Torre: **139,9 m**; foguete montado: aproximadamente **124 m**.

Selecione a base pronta e clique em **Lançar Starship**. A missão cinematográfica do jogo dura **108 segundos** e é grátis. Inclui contagem e ignição, abertura dos braços, decolagem, separação, retorno e captura do Super Heavy, reentrada da nave, abertura dos apoios, pouso e celebração. Depois do pouso, **Preparar novo lançamento** monta novamente o conjunto para outra missão.

**Acompanhar voo** acompanha o veículo em cena; **Liberar câmera** ou arrastar o terreno devolve o controle. A preferência por movimento reduzido desliga o acompanhamento automático e a oscilação dos efeitos. O botão **Som** controla também os sons do lançamento. O horário da vila permanece à escolha do jogador.

O início da missão é salvo no campo `launchAt` da construção. Recarregar a página calcula a etapa correta a partir desse horário, incluindo o pouso de missões já encerradas. Mover, girar, excluir e desfazer a compra ficam bloqueados durante o voo. Somente uma missão pode ser iniciada por vez.

## Arquivos editáveis

- `Starship_Porto_Aurora.sc`: 336 corpos nomeados, parâmetros, perfis das aletas e histórico do SolidCraft, em milímetros.
- `Starship_Porto_Aurora.blend`: modelo final, materiais com imagens incorporadas, apoios de pouso, animação de 24 fps, marcadores, fumaça/chamas de apresentação, câmeras e iluminação.
- `cad/starship-cad.glb`: geometria original exportada pelo SolidCraft.
- `renders/`: imagens renderizadas no Blender e mapas de aço escovado, cerâmica térmica e concreto.
- `mission-keyframes.json`: amostras que conectam a trajetória do jogo à animação criada no Blender.
- `design-plan.json`, `blender-export.json`, `web-export.json`: medidas e relatórios de exportação.

## Reprodução da exportação

1. Execute `python models/starship/scripts/01_build_cad.py`. Os três JSON de `cad/stage-*.json` contêm os comandos para um documento novo no SolidCraft. Execute-os em ordem e exporte para `cad/starship-cad.glb`.
2. Execute `node scripts/starship-animation-data.js` para atualizar as amostras da missão.
3. Importe o GLB do CAD em uma cena nova do Blender e execute `scripts/02_finish_blender.py`, depois `scripts/03_animate_render_export.py`. Os caminhos de trabalho estão declarados nos scripts.
4. Execute `node scripts/optimize-starship.js`. O GLB de produção conserva os pivôs e a animação `StarshipMission`, comprime a geometria com Meshopt e retira os canais constantes dos corpos rígidos.
5. `node --test tests/starship.test.js` verifica a trajetória, dimensões, pivôs, pouso, orçamento de geometria, economia e persistência. `python tests/starship-browser.py` verifica a compra e a missão na interface, com o save isolado em memória.

O jogo toca a animação exportada do Blender. Os efeitos em tempo real ficam em `src/starship-effects.js`; trajetória/etapas em `src/starship-mission.js`; som sintetizado em `src/starship-audio.js`. Os componentes rígidos são agrupados por acabamento, mantendo separados todos os pivôs animados.
