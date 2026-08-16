import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  site: "https://patilulu.com",
  output: "server",
  adapter: node({ mode: "standalone" })
});
