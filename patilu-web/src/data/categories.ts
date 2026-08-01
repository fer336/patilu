export const CATEGORY_LABELS = {
  munecos: "Muñecos",
  hogar: "Hogar",
} as const;

export type CategorySlug = keyof typeof CATEGORY_LABELS;

export const CATEGORY_SLUGS = Object.keys(CATEGORY_LABELS) as CategorySlug[];

export function isCategorySlug(value: string): value is CategorySlug {
  return Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, value);
}
