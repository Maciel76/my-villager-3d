import { DECORATION_TYPES } from "./decoration-types.js";
import { TREE_TYPES } from "./tree-types.js";
import { PLANTING_BED_TYPES } from "./planting-bed-types.js";
import { FLAG_TYPES } from "./flag-types.js";
import { PAVING_TYPES } from "./paving-types.js";

export const DEFAULT_HOUSE = "cottage";

export const HOUSE_TYPES = {
  cottage: { label: "Casa do campo" },
  chalet: { label: "Chalé de madeira" },
  townhouse: { label: "Sobrado de tijolos" },
  modern: { label: "Casa moderna" },
  cuboVerde: { label: "Casa Cubo Verde", lotSpan: 2 },
  belleEpoque: { label: "Casa Belle Époque", lotSpan: 2 },
  courtyard: { label: "Casa Pátio" },
  terrace: { label: "Casa Terraço" },
  sakura: {
    label: "Casa Sakura",
    lotSpan: 2,
  },
  oriental: { label: "Casa Oriental", lotSpan: 2 },
};

export const COMMERCIAL_TYPES = {
  bakery: { label: "Padaria" },
  market: { label: "Mercado" },
  supermarket: { label: "Supermercado Verde", lotSpan: 3 },
  cafe: { label: "Café" },
  pharmacy: { label: "Farmácia" },
  gasStation: { label: "Posto de Gasolina GS", lotSpan: 2 },
};

const APARTMENTS = {
  lexCorp: { label: "Torre LexCorp", lotSpan: 4, height: 180, workplaces: 240 },
  varandas: { label: "Residencial Varandas" },
  mirante: { label: "Torre Mirante" },
  miranteOriental: { label: "Torre Mirante Oriental", lotSpan: 2, height: 40 },
  edificioOrion: { label: "Edifício Orion", lotSpan: [4, 3], height: 56 },
  aurora: { label: "Residencial Aurora", lotSpan: 2 },
};

const LANDMARKS = {
  fireStation: {
    label: "Quartel Corpo de Bombeiros", lotSpan: [5, 4], height: 24.06, workplaces: 60,
    meadowClearance: [60, 48],
    description: "Quatro garagens, viaturas de resgate, torre de treinamento e central de emergência 193.",
  },
  starship: {
    label: "Base Starship — Porto Aurora", lotSpan: [6, 5], height: 139.9,
    meadowClearance: [72, 60],
    description: "Lançamento completo com separação, captura do propulsor e retorno da nave. Evento de 108 s.",
  },
  monumentoBombeiros: {
    label: "Monumento Corpo de Bombeiros", lotSpan: [2, 1], height: 8.5,
    meadowClearance: [14, 7],
    description: "Esculturas em bronze, brasão, arcos de aço, fontes e jardins.",
  },
  policeStation: { label: "Complexo Policial", lotSpan: [6,5], height: 28.18, workplaces: 80 },
  rotunda: { label: "Pavilhão Rotunda" },
  convergencia: { label: "A Convergência", lotSpan: 6, height: 41 },
  rodaGigante: { label: "Roda-Gigante Estrela da Vila", lotSpan: [3, 2], height: 35.2 },
  church: {
    label: "Igreja das Cúpulas",
    lotSpan: 2,
  },
  palace: { label: "Palácio Oriental", lotSpan: [3, 2] },
};

const LIGHTING = {
  lightBlock: { label: "Bloco de luz livre", freeLight: true, description: "Somente luz. Posicione em superfícies ou ajuste a altura livremente." },
  lampColonial: { label: "Clássico Colonial" },
  lampOriental: { label: "Oriental (Tōrō)" },
  lampUrban: { label: "Moderno Urbano" },
  lampDouble: { label: "Com Braço Duplo" },
  lampZen: { label: "Decorativo Zen" },
  lampSolar: { label: "Solar Inteligente" },
};

export const BUILDING_TYPES = Object.fromEntries(
  Object.entries({
    residential: HOUSE_TYPES,
    apartments: APARTMENTS,
    commercial: COMMERCIAL_TYPES,
    landmarks: LANDMARKS,
    lighting: LIGHTING,
    paving: PAVING_TYPES,
    decoration: { ...DECORATION_TYPES, ...TREE_TYPES, ...PLANTING_BED_TYPES, ...FLAG_TYPES },
  }).flatMap(([category, models]) =>
    Object.entries(models).map(([type, details]) => [
      type,
      { ...details, category },
    ]),
  ),
);

export const STARTER_HOUSES = [
  { type: "chalet", x: -16, z: 0, rotation: 0 },
  { type: "townhouse", x: 0, z: -16, rotation: 0 },
  { type: "modern", x: 16, z: 0, rotation: 0 },
  { type: "oriental", x: 6, z: 18, rotation: 0 },
  { type: "lampColonial", x: -9, z: 5, rotation: 0 },
  { type: "lampOriental", x: 3, z: 31, rotation: 0 },
  { type: "lampUrban", x: 23, z: 5, rotation: 3 },
  { type: "lampDouble", x: -9, z: -11, rotation: 0 },
  { type: "lampZen", x: 19, z: 26, rotation: 0 },
  { type: "lampSolar", x: 9, z: -8, rotation: 0 },
];
