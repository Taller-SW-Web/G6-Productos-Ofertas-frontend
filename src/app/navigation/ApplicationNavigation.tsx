import { Box, NavLink, Stack, Text } from "@mantine/core";
import { Link, useLocation } from "react-router-dom";
import { bulkNavigation, demoNavigation, productNavigation } from "./navigation";

function isItemActive(itemPath: string, currentPath: string): boolean {
  if (itemPath === currentPath) return true;
  if (itemPath === "/carga-masiva") {
    // Active for upload, review, and progress tracking, but not for /carga-masiva/descargas
    return (
      currentPath === "/carga-masiva" ||
      currentPath === "/carga-masiva/revisar" ||
      currentPath.startsWith("/carga-masiva/importaciones")
    );
  }
  return itemPath !== "/" && currentPath.startsWith(`${itemPath}/`);
}

export function ApplicationNavigation() {
  const { pathname } = useLocation();
  return (
    <Box component="nav" aria-label="Navegación de la aplicación">
      <Stack gap="lg">
        {[
          { label: "Catálogo y Carga", items: bulkNavigation },
          { label: "Precios", items: productNavigation },
          { label: "Demostraciones", items: demoNavigation },
        ].map((group) => (
          <Box key={group.label}>
            <Text size="xs" fw={600} c="dimmed" mb="sm">
              {group.label.toLocaleUpperCase("es")}
            </Text>
            <Stack gap="xs">
              {group.items.map(({ to, label, icon: Icon }) => {
                const active = isItemActive(to, pathname);
                return (
                  <NavLink
                    key={to}
                    component={Link}
                    to={to}
                    active={active}
                    aria-current={active ? "page" : undefined}
                    label={label}
                    leftSection={
                      <Icon size={20} stroke={2} aria-hidden="true" />
                    }
                  />
                );
              })}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
