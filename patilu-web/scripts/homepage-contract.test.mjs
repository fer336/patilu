import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const source = await readFile(join(root, "src/pages/index.astro"), "utf8");
const catalogSource = await readFile(join(root, "src/data/catalog.ts"), "utf8");
const fallbackSource = await readFile(join(root, "src/data/products.ts"), "utf8");
const allCatalogSource = `${source}\n${catalogSource}\n${fallbackSource}`;
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
  assert.ok(allCatalogSource.includes(`/assets/${asset}`), `Catalog does not reference ${asset}`);
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
  assert.equal(source.includes(claim), false, `Unsupported business claim remains: ${claim}`);
}

for (const requiredCopy of [
  "Consultar precio",
  "Datos de contacto próximamente",
  "Consulta de catálogo",
  "Pedido personalizado",
]) {
  assert.ok(allCatalogSource.includes(requiredCopy), `Missing neutral copy: ${requiredCopy}`);
}

assert.match(source, /getPublishedProducts/);
assert.match(source, /getPrimaryImage/);
assert.match(catalogSource, /API_INTERNAL_URL/);
assert.match(catalogSource, /ALLOW_CATALOG_FALLBACK !== "false"/);
assert.match(catalogSource, /response\.status === 404\) return null/);
assert.match(catalogSource, /price: null/);
assert.match(catalogSource, /availability: "made_to_order"/);
assert.doesNotMatch(catalogSource, /price: product\.price/);
assert.doesNotMatch(catalogSource, /availability: product\.availability/);
assert.equal(existsSync(join(root, "src/pages/healthz.ts")), false, "Web liveness must not add a source route outside frozen scope");

assert.match(source, /aria-expanded="false"/);
assert.match(source, /Escape/);
assert.match(source, /classList\.toggle\("open", open\)/);
assert.match(source, /role="status"/);
assert.match(source, /required/);
assert.match(source, /Saltar al contenido/);
assert.match(source, /prefers-reduced-motion/);
