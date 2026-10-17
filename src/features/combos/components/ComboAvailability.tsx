import { Badge } from "@mantine/core";
import type { Combo } from "../types/combos";
import { availabilityMessage } from "../services/availability";

const COLOR: Record<string, string> = {
  success: "teal",
  warning: "yellow",
  info: "blue",
  neutral: "gray",
};

export function ComboAvailability({ combo, label }: { combo: Combo; label?: string }) {
  const message = availabilityMessage(combo);
  return <Badge variant="light" color={COLOR[message.semantic] ?? "gray"}>{label ?? message.label}</Badge>;
}
