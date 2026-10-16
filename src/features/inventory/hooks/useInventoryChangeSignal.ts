import { useEffect, useState } from "react";
import { subscribeInventoryChanged } from "../services/inventoryEvents";

// Devuelve una revisión que se incrementa cada vez que el feature notifica un
// cambio de datos confirmado (recepción, umbral) o un cambio de escenario de
// desarrollo. Al incluirla en la clave de petición, los hooks vuelven a
// consultar el repositorio sin acoplarse al mecanismo que originó el cambio.
export function useInventoryChangeSignal(): number {
  const [revision, setRevision] = useState(0);

  useEffect(
    () => subscribeInventoryChanged(() => setRevision((r) => r + 1)),
    [],
  );

  return revision;
}
