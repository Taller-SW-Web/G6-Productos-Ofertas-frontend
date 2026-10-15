import { Badge } from "@mantine/core";
import type { Combo } from "../types/combos";
import { availabilityMessage } from "../services/availability";

export function ComboAvailability({ combo }: { combo: Combo }) {
  const message = availabilityMessage(combo);
  return <Badge variant="light" color={message.semantic === "warning" ? "yellow" : message.semantic === "info" ? "blue" : "gray"}>{message.label}</Badge>;
}
