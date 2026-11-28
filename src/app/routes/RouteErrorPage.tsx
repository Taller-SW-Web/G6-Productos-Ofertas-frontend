import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Button, Stack, Text, Title } from "@mantine/core";

export function RouteErrorPage() {
  const error = useRouteError();
  const chunk = error instanceof Error && /dynamically imported|ChunkLoadError|Loading chunk|module script|Importing a module script/i.test(error.message);
  return <Stack p="xl" role="alert">
    <Title order={1}>{chunk ? "Hay una nueva versión disponible" : "No se pudo abrir la pantalla"}</Title>
    <Text>{chunk ? "Recarga para recuperar los archivos de esta versión. La sesión se verificará antes de continuar." :
      isRouteErrorResponse(error) && error.status === 404 ? "La página solicitada no existe." : "Conserva tu contexto y vuelve a intentar abrir esta pantalla."}</Text>
    <Button onClick={() => location.reload()}>Recargar pantalla</Button>
  </Stack>;
}
