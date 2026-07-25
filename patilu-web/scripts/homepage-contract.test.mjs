import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const source = await readFile(join(root, "src/pages/index.astro"), "utf8");
const publicAssets = await readdir(join(root, "public/assets"));

const requiredAssets = [
  "hero.webp",
  "osito.webp",
  "capibara.webp",
  "conejita.webp",
  "ballenita.webp",
  "muneca-floral.webp",
  "unicornio.webp",
  "tendencia-hortensia.webp",
  "tendencia-dino.webp",
  "tendencia-abeja.webp",
  "personalizado.webp",
  "artesana.webp",
];

for (const asset of requiredAssets) {
  assert.ok(publicAssets.includes(asset), `Missing copied asset: ${asset}`);
  assert.ok(source.includes(`/assets/${asset}`), `Homepage does not reference ${asset}`);
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
  "Consultá disponibilidad",
  "Datos de contacto próximamente",
  "Consulta de catálogo",
  "Pedido personalizado",
]) {
  assert.ok(source.includes(requiredCopy), `Missing neutral copy: ${requiredCopy}`);
}

assert.match(source, /aria-expanded="false"/);
assert.match(source, /Escape/);
assert.match(source, /classList\.toggle\("open", open\)/);
assert.match(source, /role="status"/);
assert.match(source, /required/);
assert.match(source, /Saltar al contenido/);
assert.match(source, /prefers-reduced-motion/);
