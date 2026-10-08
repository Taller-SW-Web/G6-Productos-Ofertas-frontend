import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, Link, useLocation } from "react-router-dom";
import {
  AppShell,
  Box,
  Group,
  NavLink,
  Stack,
  Text,
  Title,
  Anchor,
} from "@mantine/core";
import {
  IconComponents,
  IconForms,
  IconLayoutList,
  IconMessageCircle,
  IconCalculator,
} from "@tabler/icons-react";
import { tokens } from "../theme/tokens";
import brandLogo from "../assets/brand/INKA_ATHLETICS.svg";
import classes from "./app.module.css";

const ListDemo = lazy(() =>
  import("../features/foundation/pages/ListDemo").then((module) => ({
    default: module.ListDemo,
  })),
);
const FormDemo = lazy(() =>
  import("../features/foundation/pages/FormDemo").then((module) => ({
    default: module.FormDemo,
  })),
);
const FeedbackDemo = lazy(() =>
  import("../features/foundation/pages/FeedbackDemo").then((module) => ({
    default: module.FeedbackDemo,
  })),
);
const CurrentPricePage = lazy(() =>
  import("../features/pricing/pages/CurrentPricePage").then((module) => ({
    default: module.CurrentPricePage,
  })),
);
const PricingPatternsPage = lazy(() =>
  import("../features/pricing/pages/PricingPatternsPage").then((module) => ({
    default: module.PricingPatternsPage,
  })),
);

const navigation = [
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
  { to: "/precios", label: "Precio vigente · piloto", icon: IconCalculator },
  {
    to: "/foundation/pricing",
    label: "Componentes Pricing",
    icon: IconComponents,
  },
];
export function App() {
  const { pathname } = useLocation();
  return (
    <AppShell
      header={{ height: tokens.layout.header }}
      navbar={{ width: tokens.layout.sidebar, breakpoint: 0 }}
      padding={tokens.layout.padding}
    >
      <AppShell.Header className={classes.header}>
        <Group h="100%" px="lg" gap="lg">
          <Box className={classes.brand}>
            <img
              className={classes.brandLogo}
              src={brandLogo}
              alt="Inka Athletics"
              width={59}
              height={44}
            />
          </Box>
          <Text size="sm">Productos y Ofertas</Text>
          <Text size="sm" ml="auto">
            Galería de componentes
          </Text>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md" bg="var(--po-surface)">
        <Stack gap="lg" h="100%">
          <Group gap="sm">
            <IconComponents size={24} stroke={2} aria-hidden="true" />
            <Text fw={600} size="sm">
              Frontend UI Foundation
            </Text>
          </Group>
          <Box component="nav" aria-label="Demostración de componentes">
            <Text size="xs" fw={600} c="dimmed" mb="sm">
              COMPONENTES
            </Text>
            <Stack gap="xs">
              {navigation.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  component={Link}
                  to={to}
                  active={pathname === to}
                  aria-current={pathname === to ? "page" : undefined}
                  label={label}
                  leftSection={<Icon size={20} stroke={2} aria-hidden="true" />}
                />
              ))}
            </Stack>
          </Box>
          <Text
            size="xs"
            c="dimmed"
            mt="auto"
            pt="md"
            style={{ borderTop: "1px solid var(--po-border)" }}
          >
            Foundation v1 · Demostración local
          </Text>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main id="contenido" style={{ minWidth: 0 }}>
        <Suspense
          fallback={
            <Text size="sm" role="status">
              Cargando página…
            </Text>
          }
        >
          <Routes>
            <Route
              path="/"
              element={<Navigate to="/foundation/listados" replace />}
            />
            <Route path="/foundation/listados" element={<ListDemo />} />
            <Route path="/foundation/formularios" element={<FormDemo />} />
            <Route path="/foundation/estados" element={<FeedbackDemo />} />
            <Route path="/precios" element={<CurrentPricePage />} />
            <Route
              path="/foundation/pricing"
              element={<PricingPatternsPage />}
            />
            <Route
              path="*"
              element={
                <Stack gap="md">
                  <Title order={1}>Página no encontrada</Title>
                  <Text>La ruta solicitada no está disponible.</Text>
                  <Anchor component={Link} to="/foundation/listados">
                    Volver a la galería
                  </Anchor>
                </Stack>
              }
            />
          </Routes>
        </Suspense>
      </AppShell.Main>
    </AppShell>
  );
}
