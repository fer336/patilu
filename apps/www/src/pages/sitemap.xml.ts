import type { APIRoute } from "astro";
import { CATEGORY_SLUGS } from "../data/categories";
import { getPublishedProducts } from "../data/catalog";

const siteUrl = "https://patilulu.com";

const staticPaths = [
  "/",
  "/productos",
  "/tendencias",
  "/personalizados",
  "/sobre-patilu",
  "/como-comprar",
  "/envios",
  "/preguntas-frecuentes",
  "/contacto",
  "/privacidad",
  "/terminos",
];

const escapeXml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

export const GET: APIRoute = async () => {
  const products = await getPublishedProducts();
  const urls = [
    ...staticPaths,
    ...CATEGORY_SLUGS.map((slug) => `/categoria/${slug}`),
    ...products.map((product) => `/productos/${product.slug}`),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((path) => `  <url><loc>${escapeXml(new URL(path, siteUrl).toString())}</loc></url>`).join("\n")}
</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
};
