import { access, readFile } from "node:fs/promises";

const mode = process.argv[2] ?? "test";
const requiredFiles = [
  "README.md",
  ".env.example",
  "shared/contracts/catalog-status.ts",
  "shared/contracts/catalog_status.py",
  "patilu/package.json",
  "patilu/src/pages/index.astro",
];

for (const file of requiredFiles) {
  await access(new URL(`../${file}`, import.meta.url));
}

const tsContract = await readFile(new URL("../shared/contracts/catalog-status.ts", import.meta.url), "utf8");
const pyContract = await readFile(new URL("../shared/contracts/catalog_status.py", import.meta.url), "utf8");

for (const value of ["draft", "published", "hidden", "deleted"]) {
  if (!tsContract.includes(value) || !pyContract.includes(value)) {
    throw new Error(`Missing shared product status value: ${value}`);
  }
}

console.log(`patilu ${mode} smoke passed`);
