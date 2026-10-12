import {
  IconCalculator,
  IconComponents,
  IconForms,
  IconLayoutList,
  IconMessageCircle,
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
}
export const productNavigation: NavigationItem[] = [
  {
    to: "/productos",
    label: "Gestión de productos",
    icon: IconPackage,
    group: "Catálogo",
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
