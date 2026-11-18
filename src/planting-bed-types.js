// Soil regions are local to each bed. Trees fit inside these regions and rest
// at the soil height, above the road/sidewalk on which the bed itself stands.
export const PLANTING_BED_TYPES = {
  bedSquare: { label: "Canteiro quadrado", size: [2.4, 2.4], description: "Bloco de concreto com terra para uma árvore", plantingBed: { height: .31, regions: [{ shape: "rect", width: 2.04, depth: 2.04 }] } },
  bedRectangle: { label: "Canteiro retangular", size: [2.2, 4.4], description: "Ilha de jardim para separar as pistas", plantingBed: { height: .31, regions: [{ shape: "rect", width: 1.84, depth: 4.04 }] } },
  bedRound: { label: "Canteiro circular", size: [3.05, 3.05], description: "Borda arredondada para árvores e pequenas praças", plantingBed: { height: .33, regions: [{ shape: "circle", radius: 1.3 }] } },
  bedMedian: { label: "Canteiro central longo", size: [1.8, 6], description: "Módulo estreito com refletores para o meio da rua", plantingBed: { height: .31, regions: [{ shape: "rect", width: 1.44, depth: 5.64 }] } },
  bedCapsule: { label: "Ilha de pontas redondas", size: [2.2, 4.6], description: "Canteiro alongado com extremidades curvas", plantingBed: { height: .33, regions: [{ shape: "capsule", radius: .93, halfLength: 1.2 }] } },
  bedDouble: { label: "Canteiro duplo", size: [2.4, 5.6], description: "Duas áreas de plantio separadas por uma travessa", plantingBed: { height: .31, regions: [{ shape: "rect", width: 2.04, depth: 2.4, z: -1.36 }, { shape: "rect", width: 2.04, depth: 2.4, z: 1.36 }] } },
};
for (const details of Object.values(PLANTING_BED_TYPES)) details.family = "beds";
