import {
  IconCalculator,
  IconHistory,
  IconCategory,
  IconUpload,
  IconComponents,
  IconForms,
  IconLayoutList,
  IconMessageCircle,
  IconTag,
  IconPackages,
  IconBrandApple,
  IconSeo,
  IconTicket,
  IconDiscount2,
  IconArrowsShuffle,
  IconPackage,
  type TablerIcon,
} from "@tabler/icons-react";
export interface NavigationItem {
  to: string;
  label: string;
  icon: TablerIcon;
  group?: string;
  matchPaths?: readonly string[];
}
export const productNavigation: NavigationItem[] = [
  {
    to: "/productos",
    label: "Gestión de productos",
    icon: IconPackage,
    group: "Catálogo",
    matchPaths: ["/productos", "/MK-004"],
  },
  {
    to: "/recomendaciones",
    label: "Venta cruzada y upselling",
    icon: IconArrowsShuffle,
    group: "Promociones",
  },
  {
    to: "/promociones",
    label: "Ofertas y promociones",
    icon: IconDiscount2,
    group: "Promociones",
  },
  {
    to: "/precios",
    label: "Consultar precios",
    icon: IconCalculator,
    group: "Precios",
  },
  {
    to: "/cupones",
    label: "Cupones de descuento",
    icon: IconTicket,
    group: "Promociones",
  },
  {
    to: "/precios/importar",
    label: "Importar precios",
    icon: IconUpload,
    group: "Precios",
    matchPaths: ["/precios/importaciones"],
  },
  {
    to: "/precios/auditoria",
    label: "Historial de precios",
    icon: IconHistory,
    group: "Precios",
  },
];
export const taxonomyNavigation: NavigationItem[] = [
  { to: "/categorias", label: "Categorías", icon: IconCategory },
  { to: "/caracteristicas", label: "Características", icon: IconTag },
  { to: "/tipos-producto", label: "Tipos de producto", icon: IconPackages },
  { to: "/marcas", label: "Marcas", icon: IconBrandApple },
  { to: "/seo", label: "SEO", icon: IconSeo },
];
export const demoNavigation: NavigationItem[] = [
  {
    to: "/foundation/listados",
    label: "Listados y filtros",
    icon: IconLayoutList,
  },
  { to: "/foundation/formularios", label: "Formularios", icon: IconForms },
  {
    to: "/foundation/estados",
    label: "Mensajes y estados",
    icon: IconMessageCircle,
  },
  {
    to: "/foundation/pricing",
    label: "Componentes Pricing",
    icon: IconComponents,
  },
];
