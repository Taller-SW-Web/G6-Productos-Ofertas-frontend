import { useState } from "react";
import { Stack, Text } from "@mantine/core";
import { ConfirmDialog, FeedbackAlert } from "../../../components/shared";
import {
  AdministrationError,
  type AdministrationRecord,
} from "../services/administration";
import { usePromotionCommand } from "../hooks/usePromotionCommand";
export function AdministrationStateDialog<T extends AdministrationRecord>({
  record,
  entityLabel,
  opened,
  change,
  reconcile,
  onCancel,
  onConfirmed,
}: {
  record: T;
  entityLabel: string;
  opened: boolean;
  change: (status: "active" | "inactive", signal: AbortSignal) => Promise<T>;
  reconcile?: (signal: AbortSignal) => Promise<import("../services/administration").PromotionReconciliation<T>>;
  onCancel: () => void;
  onConfirmed: (outcome: "CONFIRMED" | "RECONCILED") => void;
}) {
  const command = usePromotionCommand<T>();
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string>();
  const [target, setTarget] = useState<"active" | "inactive">(
    record.status === "active" ? "inactive" : "active",
  );
  const [prevOpened, setPrevOpened] = useState(false);
  if (opened && !prevOpened) {
    setPrevOpened(true);
    setTarget(record.status === "active" ? "inactive" : "active");
  } else if (!opened && prevOpened) {
    setPrevOpened(false);
  }
  const action = `${target === "active" ? "Activar" : "Desactivar"} ${entityLabel}`;
  const unknown =
    command.error instanceof AdministrationError &&
    command.error.kind === "unknown";
  const confirm = async () => {
    if (unknown) {
      if (checking) return;
      setChecking(true);
      try {
        const resolution = reconcile ? await reconcile(new AbortController().signal) : null;
        if (resolution?.status === "reconciled" && resolution.value.status === target) onConfirmed("RECONCILED");
        else if (resolution?.status === "access_denied") setCheckError("No tienes permiso para consultar la intención pendiente.");
        else if (resolution?.status === "unavailable") setCheckError("La conciliación no está disponible; la intención permanece bloqueada.");
        else
          setCheckError(
            "La lectura no acredita la intención pendiente. No se repetirá automáticamente.",
          );
      } catch {
        setCheckError("La consulta del resultado no está disponible.");
      } finally {
        setChecking(false);
      }
    } else {
      const result = await command.run((signal) => change(target, signal));
      if (result) onConfirmed(result.writeOutcome ?? "CONFIRMED");
    }
  };
  return (
    <ConfirmDialog
      opened={opened}
      title={action}
      confirmLabel={unknown ? "Consultar estado" : action}
      submitting={command.submitting || checking}
      destructive={!unknown && target === "inactive"}
      onCancel={() => {
        command.clearError();
        setCheckError(undefined);
        onCancel();
      }}
      onConfirm={() => void confirm()}
      error={
        command.error instanceof Error ? (
          <FeedbackAlert
            semantic={unknown ? "warning" : "error"}
            title={unknown ? "Estado sin confirmar" : "Cambio rechazado"}
          >
            {command.error.message}
            {checkError && <Text size="sm">{checkError}</Text>}
          </FeedbackAlert>
        ) : undefined
      }
    >
      <Stack gap="sm">
        <Text fw={600}>{record.name}</Text>
        <Text size="sm">
          {target === "inactive"
            ? "Dejará de participar en nuevas consultas. Su configuración y los pedidos históricos se conservan."
            : "Participará en nuevas consultas, sujeto a la vigencia y condiciones configuradas."}
        </Text>
        <Text size="sm">
          El estado visible solo se actualizará al confirmar el resultado.
        </Text>
      </Stack>
    </ConfirmDialog>
  );
}
