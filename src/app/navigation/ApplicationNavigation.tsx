import { Box, NavLink, Stack, Text } from "@mantine/core";
import { Link, useLocation } from "react-router-dom";
import { productNavigation } from "./navigation";

export function ApplicationNavigation() {
  const { pathname } = useLocation();
  const activeDestination = productNavigation
    .flatMap((item) =>
      [item.to, ...(item.matchPaths ?? [])].map((prefix) => ({
        to: item.to,
        prefix,
      })),
    )
    .filter(
      (item) =>
        pathname === item.prefix || pathname.startsWith(`${item.prefix}/`),
    )
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]?.to;
  return (
    <Box component="nav" aria-label="Navegación de la aplicación">
      <Stack gap="lg">
        {[{ label: "Precios", items: productNavigation }].map((group) => (
          <Box key={group.label}>
            <Text size="xs" fw={600} c="dimmed" mb="sm">
              {group.label.toLocaleUpperCase("es")}
            </Text>
            <Stack gap="xs">
              {group.items.map(({ to, label, icon: Icon }) => {
                const active = activeDestination === to;
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
