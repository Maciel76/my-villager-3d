// Preserve each flag's own proportions, including the square Swiss flag.
export const FLAG_COUNTRIES = [
  ["flagBrazil", "br", "Brasil", "do Brasil", 10 / 7],
  ["flagPortugal", "pt", "Portugal", "de Portugal", 3 / 2],
  ["flagArgentina", "ar", "Argentina", "da Argentina", 8 / 5],
  ["flagUruguay", "uy", "Uruguai", "do Uruguai", 3 / 2],
  ["flagChile", "cl", "Chile", "do Chile", 3 / 2],
  ["flagColombia", "co", "Colômbia", "da Colômbia", 3 / 2],
  ["flagUnitedStates", "us", "Estados Unidos", "dos Estados Unidos", 19 / 10],
  ["flagCanada", "ca", "Canadá", "do Canadá", 2],
  ["flagMexico", "mx", "México", "do México", 7 / 4],
  ["flagUnitedKingdom", "gb", "Reino Unido", "do Reino Unido", 2],
  ["flagFrance", "fr", "França", "da França", 3 / 2],
  ["flagGermany", "de", "Alemanha", "da Alemanha", 5 / 3],
  ["flagItaly", "it", "Itália", "da Itália", 3 / 2],
  ["flagSpain", "es", "Espanha", "da Espanha", 3 / 2],
  ["flagJapan", "jp", "Japão", "do Japão", 3 / 2],
  ["flagSouthKorea", "kr", "Coreia do Sul", "da Coreia do Sul", 3 / 2],
  ["flagChina", "cn", "China", "da China", 3 / 2],
  ["flagIndia", "in", "Índia", "da Índia", 3 / 2],
  ["flagSouthAfrica", "za", "África do Sul", "da África do Sul", 3 / 2],
  ["flagSwitzerland", "ch", "Suíça", "da Suíça", 1],
].map(([type, code, country, article, aspect]) => ({ type, code, country, article, aspect }));

export const FLAG_TYPES = Object.fromEntries(FLAG_COUNTRIES.map(country => [country.type, {
  label: `Bandeira ${country.article}`,
  description: "Bandeira ao vento, mastro de 6,6 m e ponteira dourada",
  family: "flags", country: country.code, aspect: country.aspect,
  size: [3.3, 1.1], placementSize: [.85, .85], height: 6.6,
}]));
