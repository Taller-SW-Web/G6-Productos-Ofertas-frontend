import { G7Session, type SessionView } from "../../src/features/promotions/adapters/g7Session";

export function createCatalogFixtureSession(): G7Session {
  const session = new G7Session(location.origin);
  const view: SessionView = {
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      nombreCompleto: "Gestora de prueba",
      correo: "catalog-fixture@example.invalid",
      roles: ["GESTOR_COMERCIAL"],
    },
    mfa: false,
    busy: false,
    notice: "",
    expiresAt: null,
  };
  session.snapshot = () => view;
  return session;
}
