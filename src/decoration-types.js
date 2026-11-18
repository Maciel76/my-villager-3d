// Footprints are metres, with enough clearance for every visible part.
export const DECORATION_TYPES = {
  decorBench: { label: "Banco do jardim", family: "garden", size: [3, 2], description: "Madeira ripada e braços de ferro" },
  decorPlanter: { label: "Floreira colorida", family: "garden", size: [3, 2], description: "Flores, folhagens e caixa de cedro" },
  decorFountain: { label: "Fonte das águas", family: "square", size: [4, 4], description: "Duas taças sobre um espelho d’água" },
  decorWell: { label: "Poço da vila", family: "rustic", size: [3, 3], description: "Pedra, cobertura e balde suspenso" },
  decorPergola: { label: "Pergolado florido", family: "garden", size: [5, 4], description: "Vigas de madeira e trepadeiras" },
  decorGazebo: { label: "Gazebo do parque", family: "square", size: [6, 6], description: "Pavilhão aberto com telhado de cobre" },
  decorPicnic: { label: "Mesa de piquenique", family: "leisure", size: [3, 3], description: "Mesa posta com dois bancos" },
  decorSwing: { label: "Balanço duplo", family: "leisure", size: [4, 4], description: "Dois assentos e estrutura colorida" },
  decorSlide: { label: "Escorregador", family: "leisure", size: [3, 5], description: "Torre, escada e pista amarela" },
  decorSeesaw: { label: "Gangorra", family: "leisure", size: [4, 2], description: "Brinquedo de madeira com alças" },
  decorMarket: { label: "Barraca da feira", family: "rustic", size: [4, 3], description: "Toldo listrado e caixotes de frutas" },
  decorBirdbath: { label: "Banho dos pássaros", family: "garden", size: [2, 2], description: "Taça de pedra com dois passarinhos" },
  decorSundial: { label: "Relógio de sol", family: "square", size: [2, 2], description: "Mostrador de bronze sobre pedestal" },
  decorWindmill: { label: "Moinho de jardim", family: "rustic", size: [4, 3], description: "Torre cônica e quatro pás de madeira" },
  decorFlowerCart: { label: "Carrinho de flores", family: "garden", size: [3, 2], description: "Rodas, alças e arranjos floridos" },
  decorBikeRack: { label: "Bicicletário", family: "square", size: [4, 2], description: "Quatro suportes de aço sobre piso" },
  decorRecycling: { label: "Coleta seletiva", family: "square", size: [3, 2], description: "Quatro lixeiras para cuidar da vila" },
  decorBridge: { label: "Ponte de madeira", family: "garden", size: [3, 6], description: "Passarela arqueada com corrimãos" },
  decorFirepit: { label: "Roda da fogueira", family: "leisure", size: [5, 5], description: "Círculo de pedras, lenha e bancos" },
  decorSignpost: { label: "Placa de boas-vindas", family: "rustic", size: [3, 2], description: "Painel entalhado com canteiro florido" },
};

export const DECORATION_FAMILIES = {
  garden: "Jardim",
  square: "Praça",
  leisure: "Lazer",
  rustic: "Rústico",
  trees: "Árvores",
};

// The old rounded display sizes left invisible empty margins around each item.
// Reserve the actual piece, with a little clearance, for fine garden placement.
const clearances = {
  decorBench: [2.45, .85], decorPlanter: [2.3, .95], decorFountain: [3.35, 3.35],
  decorWell: [2.65, 2.35], decorPergola: [4.75, 3.8], decorGazebo: [5.2, 5.2],
  decorPicnic: [2.65, 2.1], decorSwing: [3.75, 2.9], decorSlide: [1.5, 3.9],
  decorSeesaw: [3.4, .8], decorMarket: [3.25, 2.35], decorBirdbath: [1.45, 1.45],
  decorSundial: [1.45, 1.45], decorWindmill: [3.6, 2], decorFlowerCart: [2.5, 1.35],
  decorBikeRack: [3.65, 1.4], decorRecycling: [2.75, 1.2], decorBridge: [2.25, 5.25],
  decorFirepit: [4, 4], decorSignpost: [2.5, .85],
};
for (const [type, placementSize] of Object.entries(clearances)) DECORATION_TYPES[type].placementSize = placementSize;
