import { useEffect, useState } from "react";
import { subscribeMockChanges, type MockDomain } from "./mockState";

/**
 * Revisión reactiva que se incrementa cuando cualquiera de los dominios indicados
 * confirma un cambio, ya sea en esta pestaña (`publishMockChange`) o en otra
 * (`storage`). Incluirla en la clave de petición de un hook de lectura obliga a
 * repetir la consulta sin acoplarse al módulo que originó el cambio y sin polling.
 *
 * No consulta el almacenamiento: solo reacciona a notificaciones ya confirmadas.
 */
export function useMockStateRevision(domains: readonly MockDomain[]): number {
  const [revision, setRevision] = useState(0);
  // Clave estable: el arreglo literal cambia de identidad en cada render.
  const key = domains.join("|");

  useEffect(() => {
    const list = key ? (key.split("|") as MockDomain[]) : [];
    if (list.length === 0) return undefined;
    return subscribeMockChanges(list, () => setRevision((value) => value + 1));
  }, [key]);

  return revision;
}
