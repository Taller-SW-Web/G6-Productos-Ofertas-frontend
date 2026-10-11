import {
  IconCalculator,
  IconUpload,
  IconComponents,
  IconForms,
  IconLayoutList,
  IconMessageCircle,
  type TablerIcon,
} from "@tabler/icons-react";
export interface NavigationItem {
  to: string;
  label: string;
  icon: TablerIcon;
  matchPaths?: readonly string[];
}
export const productNavigation: NavigationItem[] = [
  { to: "/precios", label: "Consultar precios", icon: IconCalculator },
  {
    to: "/precios/importar",
    label: "Importar precios",
    icon: IconUpload,
    matchPaths: ["/precios/importaciones"],
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
