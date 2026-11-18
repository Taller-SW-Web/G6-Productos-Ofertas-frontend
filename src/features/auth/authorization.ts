import type { SessionUser } from "../promotions/adapters/g7Session";

// Docs Arquitectura.md §21, a7778ec1: permisos internos de Seguridad no son
// grants comerciales. Gateway/Backend siguen autorizando cada operación.
export function canAdminister(user: SessionUser | null): boolean {
  return user?.roles.includes("GESTOR_COMERCIAL") === true;
}
