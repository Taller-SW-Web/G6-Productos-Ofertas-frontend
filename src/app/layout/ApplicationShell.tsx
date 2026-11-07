import { Suspense } from "react";
import { AppShell, Box, Burger, Button, Group, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconLogout } from "@tabler/icons-react";
import { useAuthSession } from "../config/useAuthSession";
import { Outlet } from "react-router-dom";
import { tokens } from "../../theme/tokens";
import brandLogo from "../../assets/brand/INKA_ATHLETICS.svg";
import { ApplicationNavigation } from "../navigation/ApplicationNavigation";
import classes from "../app.module.css";
import { CommercialModeGate } from "../config/CommercialModeGate";
import { TaxonomyModeGate } from "../config/TaxonomyModeGate";

export function ApplicationShell() {
  const { session, view } = useAuthSession();
  const [menuOpened, { toggle: toggleMenu, close: closeMenu }] = useDisclosure(false);
  return (
    <AppShell
      header={{ height: view.user ? { base: 112, sm: tokens.layout.header } : tokens.layout.header }}
      navbar={{ width: tokens.layout.sidebar, breakpoint: view.user ? "sm" : 0, collapsed: { mobile: Boolean(view.user) && !menuOpened } }}
      padding={tokens.layout.padding}
    >
      <AppShell.Header className={classes.header}>
        <div className={classes.headerContent} data-authenticated={view.user ? "true" : undefined}>
          {view.user && <Burger hiddenFrom="sm" opened={menuOpened} onClick={toggleMenu} color="var(--po-cloud)" aria-label={menuOpened ? "Cerrar menú de navegación" : "Abrir menú de navegación"} aria-expanded={menuOpened} aria-controls="menu-principal" />}
          <Box className={classes.brand}>
            <img
              className={classes.brandLogo}
              src={brandLogo}
              alt="Inka Athletics"
              width={59}
              height={44}
            />
          </Box>
          <Text size="sm" className={classes.productName}>Productos y Ofertas</Text>
          {view.user && <Group className={classes.identity} gap="md" wrap="nowrap">
            <Text size="sm" className={classes.sessionName} title={`Sesión de ${view.user.nombreCompleto}`}>Sesión de {view.user.nombreCompleto}</Text>
            <Button className={classes.logout} variant="outline" leftSection={<IconLogout size={20} aria-hidden="true" />} onClick={() => { void session?.logout(); }}>Cerrar sesión</Button>
          </Group>}
        </div>
      </AppShell.Header>
      <AppShell.Navbar id="menu-principal" data-authenticated={view.user ? "true" : undefined} data-menu-opened={menuOpened ? "true" : "false"} p="md" bg="var(--po-surface)" className={classes.navbar} onClick={event => { if (event.target instanceof Element && event.target.closest("a")) closeMenu(); }}>
        <Stack gap="lg">
          <Text fw={600} size="sm">
            Navegación
          </Text>
          <ApplicationNavigation />
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
          <CommercialModeGate>
            <TaxonomyModeGate>
              <Outlet />
            </TaxonomyModeGate>
          </CommercialModeGate>
        </Suspense>
      </AppShell.Main>
    </AppShell>
  );
}
