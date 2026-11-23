// Keep local SVGs so the game's national flags never depend on a third-party CDN.
import { mkdir, writeFile } from "node:fs/promises";
import { FLAG_COUNTRIES } from "../src/flag-types.js";

const repository = "hampusborgos/country-flags";
const response = await fetch(`https://api.github.com/repos/${repository}/commits/main`, {
  headers: { "User-Agent": "Vila-Verde-assets" },
});
if (!response.ok) throw new Error(`Cannot resolve flag source: ${response.status}`);
const commit = (await response.json()).sha;
await mkdir("src/assets/flags", { recursive: true });
let bytes = 0;
for (let i = 0; i < FLAG_COUNTRIES.length; i += 4) {
  await Promise.all(FLAG_COUNTRIES.slice(i, i + 4).map(async ({ code, aspect }) => {
    const source = `https://raw.githubusercontent.com/${repository}/${commit}/svg/${code}.svg`;
    const download = await fetch(source);
    if (!download.ok) throw new Error(`${code}: ${download.status}`);
    let svg = await download.text();
    if (!svg.includes("<svg") || /<script\b/i.test(svg)) throw new Error(`Invalid SVG: ${code}`);
    // Set the raster resolution used by the browser without altering the artwork.
    svg = svg.replace(/<svg\b([^>]*)>/, (_, attributes) => {
      const clean = attributes.replace(/\s(?:width|height)\s*=\s*["'][^"']*["']/g, "");
      return `<svg${clean} width="1024" height="${Math.round(1024 / aspect)}">`;
    });
    await writeFile(`src/assets/flags/${code}.svg`, svg);
    bytes += Buffer.byteLength(svg);
  }));
}
await writeFile("src/assets/flags/sources.json", JSON.stringify({
  repository: `https://github.com/${repository}`, commit,
  artwork: "Country flag SVGs sourced from Wikimedia Commons by country-flags; public-domain artwork, as described by the source repository.",
  files: FLAG_COUNTRIES.map(({code})=>`${code}.svg`),
}, null, 2));
console.log(`${FLAG_COUNTRIES.length} local flag SVGs; ${bytes} bytes; source ${commit}`);
