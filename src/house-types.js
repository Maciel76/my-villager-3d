import { DECORATION_TYPES } from "./decoration-types.js";
import { TREE_TYPES } from "./tree-types.js";
import { PLANTING_BED_TYPES } from "./planting-bed-types.js";

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
  varandas: { label: "Residencial Varandas" },
  mirante: { label: "Torre Mirante" },
  aurora: { label: "Residencial Aurora", lotSpan: 2 },
};

const LANDMARKS = {
  rotunda: { label: "Pavilhão Rotunda" },
  church: {
    label: "Igreja das Cúpulas",
    lotSpan: 2,
  },
  palace: { label: "Palácio Oriental", lotSpan: [3, 2] },
};

const LIGHTING = {
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
    decoration: { ...DECORATION_TYPES, ...TREE_TYPES, ...PLANTING_BED_TYPES },
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
