export const PRODUCT_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  HIDDEN: "hidden",
  DELETED: "deleted"
} as const;

export type ProductStatus = (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];

export const AVAILABILITY_STATUS = {
  AVAILABLE: "available",
  MADE_TO_ORDER: "made_to_order",
  RESERVED: "reserved",
  SOLD_OUT: "sold_out"
} as const;

export type AvailabilityStatus = (typeof AVAILABILITY_STATUS)[keyof typeof AVAILABILITY_STATUS];

export const TREND_STATUS = {
  CANDIDATE: "candidate",
  IN_REVIEW: "in_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  PUBLISHED: "published"
} as const;

export type TrendStatus = (typeof TREND_STATUS)[keyof typeof TREND_STATUS];

export const COPYRIGHT_RISK = {
  UNKNOWN: "unknown",
  LOW: "low",
  NEEDS_REVIEW: "needs_review",
  REJECTED: "rejected"
} as const;

export type CopyrightRisk = (typeof COPYRIGHT_RISK)[keyof typeof COPYRIGHT_RISK];
