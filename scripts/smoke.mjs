import { access } from "node:fs/promises";

const mode = process.argv[2] ?? "test";
const requiredFiles = [
  "README.md",
  ".env.example",
  "patilu/package.json",
  "patilu/src/pages/index.astro"
];

for (const file of requiredFiles) {
  await access(new URL(`../${file}`, import.meta.url));
}

console.log(`patilu ${mode} smoke passed`);
