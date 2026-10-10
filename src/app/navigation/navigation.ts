import {
  IconCalculator,
  IconComponents,
  IconFileSpreadsheet,
  IconForms,
  IconLayoutList,
  IconMessageCircle,
  IconUpload,
  type TablerIcon,
} from "@tabler/icons-react";

export interface NavigationItem {
  to: string;
  label: string;
  icon: TablerIcon;
}

export const bulkNavigation: NavigationItem[] = [
  { to: "/carga-masiva", label: "Carga masiva", icon: IconUpload },
  {
    to: "/carga-masiva/descargas",
    label: "Descargas y exportación",
    icon: IconFileSpreadsheet,
  },
];

export const productNavigation: NavigationItem[] = [
  { to: "/precios", label: "Consultar precios", icon: IconCalculator },
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
