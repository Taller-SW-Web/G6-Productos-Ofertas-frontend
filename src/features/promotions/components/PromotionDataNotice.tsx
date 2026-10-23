import { Text } from "@mantine/core";
import { useContext } from "react";
import { DataModeContext } from "../../../app/config/DataModeContext";

/** Promotions remains mock-only until the provider contract is available. */
export function PromotionDataNotice({ kind }: { kind: string }) {
  const mode = useContext(DataModeContext);
  if (mode !== "mock" || (kind !== "coupons" && kind !== "coupon-form"))
    return null;
  return (
    <Text size="sm" c="dimmed">
      Entorno de prueba: la información presentada es de referencia. Consultar
      un cupón no aplica descuentos ni registra consumo o restitución de usos.
    </Text>
  );
}
