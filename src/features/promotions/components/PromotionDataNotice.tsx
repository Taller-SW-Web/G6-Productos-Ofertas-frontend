import { Text } from "@mantine/core";
import { FeedbackAlert } from "../../../components/shared";

/** Promotions remains mock-only until the provider contract is available. */
export function PromotionDataNotice(_: { kind: string }) {
  void _;
  return (
    <FeedbackAlert semantic="info" title="Datos de demostración">
      <Text size="sm">
        Esta pantalla usa datos simulados. La vigencia, elegibilidad y límites
        son informativos; no se consume ni restaura un cupón en un pedido.
      </Text>
    </FeedbackAlert>
  );
}
