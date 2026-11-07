import { Button, Stack, Text, Title } from "@mantine/core";
import { useAuthSession } from "../../../app/config/useAuthSession";

export function AccessDenied() {
  const { session } = useAuthSession();
  return <main><Stack p="xl" align="center">
    <Title order={1}>Acceso denegado</Title>
    <Text role="alert">Tu cuenta no tiene el rol GESTOR_COMERCIAL requerido para este panel.</Text>
    <Button onClick={() => { void session?.logout(); }}>Cerrar sesión</Button>
  </Stack></main>;
}
