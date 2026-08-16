export const AVAILABILITY = {
  AVAILABLE: "available",
  MADE_TO_ORDER: "made_to_order",
  RESERVED: "reserved",
  SOLD_OUT: "sold_out",
} as const;

export const PUBLICATION_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  HIDDEN: "hidden",
  DELETED: "deleted",
} as const;

export type Availability = (typeof AVAILABILITY)[keyof typeof AVAILABILITY];
export type PublicationStatus = (typeof PUBLICATION_STATUS)[keyof typeof PUBLICATION_STATUS];

export interface ProductImage {
  id: string;
  url: string;
  alt_text: string;
  position: number;
  is_primary: boolean;
  width: number;
  height: number;
  content_type: string;
}

export interface Product {
  id: string;
  slug: string;
  title: string;
  description: string;
  measure: string;
  price: string | null;
  currency: string;
  availability: Availability;
  status: PublicationStatus;
  images: ProductImage[];
  created_at: string;
  updated_at: string;
}

export interface ProductInput {
  slug: string;
  title: string;
  description: string;
  measure: string;
  price: string | null;
  currency: string;
  availability: Availability;
  status: PublicationStatus;
}

export interface NewImage {
  id: string;
  file: File;
  previewUrl: string;
  altText: string;
}
