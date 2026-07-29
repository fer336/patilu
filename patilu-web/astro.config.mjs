import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  site: "https://patilu.qeva.xyz",
  output: "server",
  adapter: node({ mode: "standalone" })
});
