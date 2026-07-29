import { products as fallbackProducts, type Product as FallbackProduct } from "./products";

export const AVAILABILITY_LABELS = { available: "Disponible", made_to_order: "A pedido", reserved: "Reservado", sold_out: "Agotado" } as const;
export type Availability = keyof typeof AVAILABILITY_LABELS;

export interface CatalogImage { id: string; url: string; alt_text: string; position: number; is_primary: boolean }
export interface CatalogProduct { id: string; slug: string; title: string; description: string; measure: string; price: string | null; currency: string; availability: Availability; images: CatalogImage[] }

const apiBaseUrl = process.env.API_INTERNAL_URL ?? import.meta.env.API_BASE_URL ?? "http://localhost:8000";
const allowFallback = process.env.ALLOW_CATALOG_FALLBACK !== "false";

function fallbackToCatalog(product: FallbackProduct): CatalogProduct {
  return { id: `fallback-${product.slug}`, slug: product.slug, title: product.name, description: product.description, measure: product.measure, price: null, currency: product.currency, availability: "made_to_order", images: product.gallery.map((url, position) => ({ id: `fallback-${product.slug}-${position}`, url, alt_text: position === 0 ? product.alt : `Detalle de ${product.name}`, position, is_primary: position === 0 })) };
}

export async function getPublishedProducts(): Promise<CatalogProduct[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/products`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Catalog API returned ${response.status}`);
    return await response.json() as CatalogProduct[];
  } catch (error) {
    if (!allowFallback) throw error;
    console.warn("Catalog API unavailable; using local development fallback.", error);
    return fallbackProducts.map(fallbackToCatalog);
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
    const fallback = fallbackProducts.find((product) => product.slug === slug);
    return fallback ? fallbackToCatalog(fallback) : null;
  }
}

export function getPrimaryImage(product: CatalogProduct): CatalogImage | undefined { return product.images.find((image) => image.is_primary); }
export function formatPrice(product: Pick<CatalogProduct, "price" | "currency">): string { return product.price === null ? "Consultar precio" : new Intl.NumberFormat("es-AR", { style: "currency", currency: product.currency }).format(Number(product.price)); }
