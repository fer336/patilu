import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const root = new URL("..", import.meta.url).pathname;

async function collectFiles(dir, extensions) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath, extensions)));
    } else if (extensions.includes(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

const astroFiles = await collectFiles(join(root, "src"), [".astro"]);
const astroContents = await Promise.all(astroFiles.map((path) => readFile(path, "utf8")));
const astroSource = astroContents.join("\n");

const dataFiles = await collectFiles(join(root, "src/data"), [".ts"]);
const dataContents = await Promise.all(dataFiles.map((path) => readFile(path, "utf8")));
const dataSource = dataContents.join("\n");

const siteSource = `${astroSource}\n${dataSource}`;

const indexSource = await readFile(join(root, "src/pages/index.astro"), "utf8");
const catalogSource = await readFile(join(root, "src/data/catalog.ts"), "utf8");
const publicAssets = await readdir(join(root, "public/assets"));

const requiredAssets = [
  "muneca.webp",
  "oveja.webp",
  "taza.webp",
  "muneco-stranger-1.webp",
  "muneco-stranger-2.webp",
  "osito.webp",
  "capibara.webp",
  "conejita.webp",
  "ballenita.webp",
  "muneca-floral.webp",
  "unicornio.webp",
  "personalizado.webp",
  "artesana.webp",
];

for (const asset of requiredAssets) {
  assert.ok(publicAssets.includes(asset), `Missing copied asset: ${asset}`);
  assert.ok(siteSource.includes(`/assets/${asset}`), `Site does not reference ${asset}`);
}

const unsupportedClaims = [
  "ARS ",
  "Disponible",
  "Últimas unidades",
  "★★★★★",
  "5490000000000",
  "patilu.com.ar",
  "hola@patilu.com.ar",
  "instagram.com/patilu",
  "A todo el país",
  "Cambios y devoluciones",
];

for (const claim of unsupportedClaims) {
  assert.equal(astroSource.includes(claim), false, `Unsupported business claim remains: ${claim}`);
}

for (const requiredCopy of [
  "Consultar precio",
  "5492254531588",
  "Consulta de catálogo",
  "Pedido personalizado",
]) {
  assert.ok(siteSource.includes(requiredCopy), `Missing neutral copy: ${requiredCopy}`);
}

assert.match(siteSource, /getPublishedProducts/);
assert.match(siteSource, /getPrimaryImage/);
assert.match(catalogSource, /API_INTERNAL_URL/);
assert.match(catalogSource, /ALLOW_CATALOG_FALLBACK !== "false"/);
assert.match(catalogSource, /response\.status === 404\) return null/);
assert.match(catalogSource, /price: null/);
assert.match(catalogSource, /availability: "made_to_order"/);
assert.doesNotMatch(catalogSource, /price: product\.price/);
assert.doesNotMatch(catalogSource, /availability: product\.availability/);
assert.equal(existsSync(join(root, "src/pages/healthz.ts")), false, "Web liveness must not add a source route outside frozen scope");

assert.match(astroSource, /aria-expanded="false"/);
assert.match(astroSource, /Escape/);
assert.match(astroSource, /classList\.toggle\("open", open\)/);
assert.match(astroSource, /role="status"/);
assert.match(astroSource, /required/);
assert.match(astroSource, /Saltar al contenido/);
assert.match(astroSource, /prefers-reduced-motion/);

// Site architecture contract: every planned route from the site-architecture
// review must exist as a real page, not an in-page anchor.
const requiredRoutes = [
  "src/pages/index.astro",
  "src/pages/productos/index.astro",
  "src/pages/productos/[slug].astro",
  "src/pages/categoria/[slug].astro",
  "src/pages/tendencias.astro",
  "src/pages/personalizados.astro",
  "src/pages/como-comprar.astro",
  "src/pages/envios.astro",
  "src/pages/preguntas-frecuentes.astro",
  "src/pages/sobre-patilu.astro",
  "src/pages/contacto.astro",
  "src/pages/privacidad.astro",
  "src/pages/terminos.astro",
];

for (const route of requiredRoutes) {
  assert.ok(existsSync(join(root, route)), `Missing required route file: ${route}`);
}

assert.doesNotMatch(indexSource, /href="#\w/, "Homepage nav/CTAs must use real routes, not #anchors");
assert.doesNotMatch(siteSource, /categoria\/stranger-things/i, "Licensed/franchise characters must not become a taxonomy node");
