import { Anchor, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
export function NotFoundPage() {
  return (
    <Stack gap="md">
      <Title order={1}>Página no encontrada</Title>
      <Text>La ruta solicitada no está disponible.</Text>
      <Anchor component={Link} to="/foundation/listados">
        Volver a la galería
      </Anchor>
    </Stack>
  );
}
