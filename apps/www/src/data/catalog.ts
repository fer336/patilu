import type { Product as FallbackProduct } from "./products";
import type { CategorySlug } from "./categories";

export const AVAILABILITY_LABELS = { available: "Disponible", made_to_order: "A pedido", reserved: "Reservado", sold_out: "Agotado" } as const;
export type Availability = keyof typeof AVAILABILITY_LABELS;

export interface CatalogImage { id: string; url: string; alt_text: string; position: number; is_primary: boolean }
export interface CatalogProduct { id: string; slug: string; title: string; description: string; measure: string; price: string | null; currency: string; availability: Availability; category: CategorySlug; trend: boolean; images: CatalogImage[] }

const apiBaseUrl = process.env.API_INTERNAL_URL ?? import.meta.env.API_BASE_URL ?? "http://localhost:8000";
const allowFallback = process.env.ALLOW_CATALOG_FALLBACK === "true";

function fallbackToCatalog(product: FallbackProduct): CatalogProduct {
  return { id: `fallback-${product.slug}`, slug: product.slug, title: product.name, description: product.description, measure: product.measure, price: null, currency: product.currency, availability: "made_to_order", category: product.category, trend: product.trend, images: product.gallery.map((url, position) => ({ id: `fallback-${product.slug}-${position}`, url, alt_text: position === 0 ? product.alt : `Detalle de ${product.name}`, position, is_primary: position === 0 })) };
}

async function getFallbackProducts(): Promise<CatalogProduct[]> {
  const { products } = await import("./products");
  return products.map(fallbackToCatalog);
}

export async function getPublishedProducts(): Promise<CatalogProduct[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/products`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Catalog API returned ${response.status}`);
    return await response.json() as CatalogProduct[];
  } catch (error) {
    if (!allowFallback) throw error;
    console.warn("Catalog API unavailable; using local development fallback.", error);
    return getFallbackProducts();
  }
}

export async function getPublishedProduct(slug: string): Promise<CatalogProduct | null> {
  try {
    const response = await fetch(`${apiBaseUrl}/products/${encodeURIComponent(slug)}`, { headers: { Accept: "application/json" } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Catalog API returned ${response.status}`);
    return await response.json() as CatalogProduct;
  } catch (error) {
    if (!allowFallback) throw error;
    console.warn("Catalog API unavailable; using local development fallback.", error);
    const fallback = await getFallbackProducts();
    return fallback.find((product) => product.slug === slug) ?? null;
  }
}

export function getPrimaryImage(product: CatalogProduct): CatalogImage | undefined { return product.images.find((image) => image.is_primary); }
export function formatPrice(product: Pick<CatalogProduct, "price" | "currency">): string { return product.price === null ? "Consultar precio" : new Intl.NumberFormat("es-AR", { style: "currency", currency: product.currency }).format(Number(product.price)); }
export function getProductsByCategory(products: CatalogProduct[], category: CategorySlug): CatalogProduct[] { return products.filter((product) => product.category === category); }
export function getTrendingProducts(products: CatalogProduct[]): CatalogProduct[] { return products.filter((product) => product.trend); }
