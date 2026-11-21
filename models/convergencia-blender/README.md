# Convergência — Confinamento Estelar

Versão refinada no Blender a partir de `createConvergencia()`, o modelo procedural que estava no jogo. A construção continua com o identificador `convergencia`, o mesmo lote de 72 × 72 m, preço, regra de uma instalação por vila e progresso da Explosão Estelar. As vilas salvas carregam automaticamente esta versão.

O modelo ganhou blindagem de cerâmica térmica, suportes de titânio, braçadeiras, pistões e ancoragens. Linhas de refrigeração e três unidades de resfriamento alimentam os módulos da câmara central. Os três anéis e a coroa têm condutores de cobre, módulos magnéticos, tampas, fixadores e indicadores luminosos.

Os mapas de cor e de normais foram criados no Blender para cerâmica, metal, cobre e basalto. O mini-sol, as cascatas e os efeitos estelares continuam sendo renderizados pelos shaders do jogo. Os componentes novos acompanham os seis braços articulados e os pivôs dos anéis e da coroa, inclusive no lançamento, no recolhimento, no desligamento e na reativação.

Os três braços menores agora são injetores articulados. Durante os 12 segundos de drenagem, os acumuladores clareiam de azul até branco e liberam três cargas visíveis para o poço central. Os tubos se recolhem para dentro de suas bases e o mini-sol permanece visível, em tamanho normal, durante toda essa preparação. Na reativação, os tubos sobem e os injetores se armam novamente.

Os anéis aceleram continuamente até o lançamento: a velocidade cresce de forma cúbica e chega a 25 vezes a rotação de espera no instante da ejeção. Depois desaceleram suavemente antes do recolhimento. A rotação é calculada pelo tempo da missão, preservando a continuidade ao recarregar o jogo.

A coroa superior se expande no alto até um raio de 34,7 m antes de descer por fora dos braços. Ela pousa em torno da instalação, dentro do lote existente. Sua espessura radial permanece constante. Na reativação, sobe aberta e só volta ao raio original quando chega ao alto.

## Arquivos

- `Convergencia_Confinamento_Estelar.blend`: arquivo editável com as texturas incorporadas, modelo refinado, componentes móveis separados, mini-sol de apresentação, câmeras e iluminação.
- A linha do tempo do Blender inclui uma prévia mecânica dos braços, dos tubos e da descida externa da coroa, com marcadores das etapas.
- `game-original.json.gz`: geometria, materiais, metadados e hierarquia exportados diretamente do código original do jogo, sem incluir o feixe de 640 m na geometria do monumento.
- `textures/`: mapas criados no Blender.
- `renders/Convergencia_Reforcada.png` e `renders/Camara_Contencao_Detalhe.png`: apresentações renderizadas no Blender.
- `blender-export.json` e `web-export.json`: relatórios da exportação.
- `../../src/assets/models/optimized/convergencia-refinada.glb`: versão entregue ao jogo, com Meshopt e quantização de posições/normais. Os mapas mantêm sua resolução de 512 × 512.

## Exportar novamente

Para reconstruir a partir do modelo procedural, execute `node scripts/export-convergence-to-blender.js`, depois abra o Blender em segundo plano com `--background --factory-startup --python models/convergencia-blender/scripts/01_refine_convergence.py`.

Para exportar alterações feitas no arquivo `.blend`, execute nele `scripts/02_export_edited_blend.py`. Os objetos marcados com a propriedade `gameMesh`, e seus pais, são exportados; o mini-sol e o estúdio de apresentação ficam no Blender.

Depois execute `node scripts/optimize-convergence.js` e `npm run build`. A preparação do modelo fica em `src/convergencia-hardware.js`. A animação existente permanece em `src/convergencia-efeitos.js`.

Validação: `node --test tests/convergencia-blender.test.js` verifica dimensões, pivôs, texturas, orçamento de geometria e as fases da animação. `python tests/convergence-refined-browser.py` confere o modelo real no jogo com um save isolado em memória, incluindo loja, noite, Explosão Estelar, recolhimento, reativação e recarregamento.
