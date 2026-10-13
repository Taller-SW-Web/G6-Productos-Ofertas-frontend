import { Box, NavLink, Stack, Text } from "@mantine/core";
import { Link, useLocation } from "react-router-dom";
import { productNavigation, taxonomyNavigation } from "./navigation";

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
  const groups = [
    ...Array.from(
      new Set(productNavigation.map((item) => item.group ?? "Navegación")),
    ).map((label) => ({
      label,
      items: productNavigation.filter(
        (item) => (item.group ?? "Navegación") === label,
      ),
    })),
    { label: "Taxonomía", items: taxonomyNavigation },
  ];
  return (
    <Box component="nav" aria-label="Navegación de la aplicación">
      <Stack gap="lg">
        {groups.map((group) => (
          <Box key={group.label}>
            <Text size="xs" fw={600} c="dimmed" mb="sm">
              {group.label.toLocaleUpperCase("es")}
            </Text>
            <Stack gap="xs">
              {group.items.map(({ to, label, icon: Icon }) => {
                const active = productNavigation.some((item) => item.to === to)
                  ? activeDestination === to
                  : pathname === to || pathname.startsWith(`${to}/`);
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
