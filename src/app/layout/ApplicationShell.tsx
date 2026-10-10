import { Suspense } from "react";
import { AppShell, Box, Group, Stack, Text } from "@mantine/core";
import { IconComponents } from "@tabler/icons-react";
import { Outlet } from "react-router-dom";
import { tokens } from "../../theme/tokens";
import brandLogo from "../../assets/brand/INKA_ATHLETICS.svg";
import { ApplicationNavigation } from "../navigation/ApplicationNavigation";
import classes from "../app.module.css";
export function ApplicationShell() {
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
            Foundation · Piloto con mocks
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
          <ApplicationNavigation />
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
          <Outlet />
        </Suspense>
      </AppShell.Main>
    </AppShell>
  );
}
