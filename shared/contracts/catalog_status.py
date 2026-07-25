from typing import Literal

ProductStatus = Literal["draft", "published", "hidden", "deleted"]
AvailabilityStatus = Literal["available", "made_to_order", "reserved", "sold_out"]
TrendStatus = Literal["candidate", "in_review", "approved", "rejected", "published"]
CopyrightRisk = Literal["unknown", "low", "needs_review", "rejected"]

PRODUCT_STATUS: tuple[ProductStatus, ...] = ("draft", "published", "hidden", "deleted")
AVAILABILITY_STATUS: tuple[AvailabilityStatus, ...] = (
    "available",
    "made_to_order",
    "reserved",
    "sold_out",
)
TREND_STATUS: tuple[TrendStatus, ...] = (
    "candidate",
    "in_review",
    "approved",
    "rejected",
    "published",
)
COPYRIGHT_RISK: tuple[CopyrightRisk, ...] = (
    "unknown",
    "low",
    "needs_review",
    "rejected",
)
