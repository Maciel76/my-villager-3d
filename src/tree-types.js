// Planting clearance follows the trunk; crowns may overhang neighbouring gardens.
export const TREE_TYPES = {
  treeOak: { label: "Carvalho", size: [7, 7], placementSize: [1.2, 1.2], description: "Copa ampla, galhos robustos e folhas verdes" },
  treeMaple: { label: "Bordo de outono", size: [6, 6], placementSize: [1, 1], description: "Folhagem em tons de cobre, laranja e vermelho" },
  treeIpeYellow: { label: "Ipê-amarelo", size: [6, 6], placementSize: [1, 1], description: "Galhos abertos e uma copa de flores douradas" },
  treeIpePurple: { label: "Ipê-roxo", size: [6, 6], placementSize: [1, 1], description: "Flores lilases e violetas em cachos" },
  treeCherry: { label: "Cerejeira", size: [6, 6], placementSize: [1, 1], description: "Flores rosadas em uma copa delicada" },
  treePine: { label: "Pinheiro", size: [5, 5], placementSize: [.9, .9], description: "Copa em camadas e agulhas verde-escuras" },
  treeAraucaria: { label: "Araucária", size: [7, 7], placementSize: [1, 1], description: "Tronco alto e galhos em forma de guarda-sol" },
  treeCypress: { label: "Cipreste", size: [3, 3], placementSize: [.75, .75], description: "Copa estreita e alongada para caminhos e entradas" },
  treePalm: { label: "Palmeira tropical", size: [7, 7], placementSize: [.9, .9], description: "Tronco anelado, folhas longas e pequenos cocos" },
  treeApple: { label: "Macieira", size: [5, 5], placementSize: [1, 1], description: "Copa baixa com maçãs vermelhas entre as folhas" },
  treeOrange: { label: "Laranjeira", size: [5, 5], placementSize: [1, 1], description: "Folhas vivas e laranjas maduras na copa" },
  treeWillow: { label: "Salgueiro-chorão", size: [7, 7], placementSize: [1.2, 1.2], description: "Folhagem pendente em vários tons de verde" },
};
for (const details of Object.values(TREE_TYPES)) details.family = "trees";
