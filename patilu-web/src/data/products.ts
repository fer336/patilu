export type Product = {
  slug: string;
  badge: string;
  badgeClass: string;
  image: string;
  gallery: string[];
  name: string;
  alt: string;
  description: string;
  category: string;
  measure: string;
  price: string | null;
  currency: string;
  availability: "available" | "made_to_order" | "reserved" | "sold_out";
};

export const whatsappNumber = "5492254531588";

export const products: Product[] = [
  {
    slug: "muneca-tejida",
    badge: "¡Más elegido!",
    badgeClass: "badge-pink",
    image: "/assets/muneca.webp",
    gallery: ["/assets/muneca.webp", "/assets/muneca-floral.webp"],
    name: "Muñeca tejida",
    alt: "Muñeca tejida al crochet",
    description: "Muñeca artesanal tejida al crochet, ideal para consultar como regalo o recuerdo personalizado.",
    category: "Muñecos",
    measure: "Medida a confirmar", price: null, currency: "ARS", availability: "made_to_order",
  },
  {
    slug: "oveja-crochet",
    badge: "Nuevo",
    badgeClass: "badge-green",
    image: "/assets/oveja.webp",
    gallery: ["/assets/oveja.webp", "/assets/osito.webp"],
    name: "Oveja crochet",
    alt: "Oveja tejida al crochet",
    description: "Oveja tejida al crochet con terminación suave y detalles artesanales a consultar.",
    category: "Amigurumis",
    measure: "Medida a confirmar", price: null, currency: "ARS", availability: "made_to_order",
  },
  {
    slug: "taza-tejida",
    badge: "",
    badgeClass: "",
    image: "/assets/taza.webp",
    gallery: ["/assets/taza.webp", "/assets/ballenita.webp"],
    name: "Taza tejida",
    alt: "Taza tejida al crochet",
    description: "Pieza tejida al crochet para regalar o decorar, con precio y disponibilidad a confirmar.",
    category: "Decoración",
    measure: "Medida a confirmar", price: null, currency: "ARS", availability: "made_to_order",
  },
  {
    slug: "muneco-personalizado",
    badge: "",
    badgeClass: "",
    image: "/assets/muneco-stranger-1.webp",
    gallery: ["/assets/muneco-stranger-1.webp", "/assets/personalizado.webp"],
    name: "Muñeco personalizado",
    alt: "Muñeco personalizado tejido al crochet",
    description: "Diseño personalizado tejido al crochet, sujeto a revisión de idea, colores, tamaño y detalles.",
    category: "Personalizados",
    measure: "A definir según el diseño", price: null, currency: "ARS", availability: "made_to_order",
  },
  {
    slug: "muneco-especial",
    badge: "Nuevo",
    badgeClass: "badge-green",
    image: "/assets/muneco-stranger-2.webp",
    gallery: ["/assets/muneco-stranger-2.webp", "/assets/capibara.webp"],
    name: "Muñeco especial",
    alt: "Muñeco especial tejido al crochet",
    description: "Muñeco tejido con detalles especiales. Consultá posibilidades antes de avanzar.",
    category: "Personalizados",
    measure: "A definir según el diseño", price: null, currency: "ARS", availability: "made_to_order",
  },
  {
    slug: "muneca-artesanal",
    badge: "",
    badgeClass: "",
    image: "/assets/muneca-floral.webp",
    gallery: ["/assets/muneca-floral.webp", "/assets/conejita.webp", "/assets/unicornio.webp"],
    name: "Muñeca artesanal",
    alt: "Muñeca artesanal tejida al crochet",
    description: "Muñeca artesanal con detalles tejidos, pensada para regalos únicos y consultas personalizadas.",
    category: "Muñecos",
    measure: "Medida a confirmar", price: null, currency: "ARS", availability: "made_to_order",
  },
];

export const getProductWhatsappUrl = (product: Pick<Product, "name">) => {
  const text = `Hola Patilu, quiero consultar por ${product.name}. ¿Me pasás precio y disponibilidad?`;
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
};
