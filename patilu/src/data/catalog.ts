import { products as fallbackProducts, type Product as FallbackProduct } from "./products";
import type { CategorySlug } from "./categories";

export const AVAILABILITY_LABELS = { available: "Disponible", made_to_order: "A pedido", reserved: "Reservado", sold_out: "Agotado" } as const;
export type Availability = keyof typeof AVAILABILITY_LABELS;

export interface CatalogImage { id: string; url: string; alt_text: string; position: number; is_primary: boolean }
export interface CatalogProduct { id: string; slug: string; title: string; description: string; measure: string; price: string | null; currency: string; availability: Availability; category: CategorySlug; trend: boolean; images: CatalogImage[] }

function toCatalogProduct(product: FallbackProduct): CatalogProduct {
  return { id: product.slug, slug: product.slug, title: product.name, description: product.description, measure: product.measure, price: null, currency: product.currency, availability: "made_to_order", category: product.category, trend: product.trend, images: product.gallery.map((url, position) => ({ id: `${product.slug}-${position}`, url, alt_text: position === 0 ? product.alt : `Detalle de ${product.name}`, position, is_primary: position === 0 })) };
}

const catalogProducts: CatalogProduct[] = fallbackProducts.map(toCatalogProduct);

export async function getPublishedProducts(): Promise<CatalogProduct[]> {
  return catalogProducts;
}

export async function getPublishedProduct(slug: string): Promise<CatalogProduct | null> {
  return catalogProducts.find((product) => product.slug === slug) ?? null;
}

export function getPrimaryImage(product: CatalogProduct): CatalogImage | undefined { return product.images.find((image) => image.is_primary); }
export function formatPrice(product: Pick<CatalogProduct, "price" | "currency">): string { return product.price === null ? "Consultar precio" : new Intl.NumberFormat("es-AR", { style: "currency", currency: product.currency }).format(Number(product.price)); }
export function getProductsByCategory(products: CatalogProduct[], category: CategorySlug): CatalogProduct[] { return products.filter((product) => product.category === category); }
export function getTrendingProducts(products: CatalogProduct[]): CatalogProduct[] { return products.filter((product) => product.trend); }
