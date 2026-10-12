import { useState } from "react";
import { Button, Stack, Text } from "@mantine/core";
import { ConfirmDialog, FeedbackAlert } from "../../../components/shared";
import { usePromotionCommand } from "../hooks/usePromotionCommand";
import { couponService } from "../services/couponService";
import {
  CouponWriteError,
  type CouponMutationScenario,
  type CouponView,
} from "../services/couponRepository";
import {
  couponStatusLabel,
  couponUsageLabel,
} from "../services/couponPresentation";

export function CouponStateDialog({
  coupon,
  scenario,
  opened,
  onCancel,
  onConfirmed,
}: {
  coupon: CouponView;
  scenario: CouponMutationScenario;
  opened: boolean;
  onCancel: () => void;
  onConfirmed: () => void;
}) {
  const command = usePromotionCommand<CouponView>();
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string>();
  const target = coupon.status === "active" ? "inactive" : "active";
  const unknown =
    command.error instanceof CouponWriteError &&
    command.error.kind === "unknown";
  const confirm = async () => {
    if (unknown) {
      if (checking) return;
      setChecking(true);
      try {
        const result = await couponService.read(
          coupon.id,
          "default",
          new AbortController().signal,
        );
        if (result?.status === target) onConfirmed();
        else
          setCheckError(
            "La consulta no confirmó el estado solicitado. No se reenviará el cambio automáticamente.",
          );
      } catch {
        setCheckError(
          "No se pudo consultar el estado. La confirmación sigue pendiente.",
        );
      } finally {
        setChecking(false);
      }
      return;
    }
    const result = await command.run((signal) =>
      couponService.changeStatus(coupon.id, target, scenario, signal),
    );
    if (result) onConfirmed();
  };
  return (
    <ConfirmDialog
      opened={opened}
      title={target === "inactive" ? "Desactivar cupón" : "Activar cupón"}
      confirmLabel={
        unknown
          ? "Consultar estado"
          : target === "inactive"
            ? "Desactivar cupón"
            : "Activar cupón"
      }
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
            title={unknown ? "Estado sin confirmar" : "No se cambió el estado"}
          >
            {command.error.message}
            {checkError && <Text size="sm">{checkError}</Text>}
          </FeedbackAlert>
        ) : undefined
      }
    >
      <Stack gap="sm">
        <Text fw={600}>{coupon.code}</Text>
        <Text size="sm">
          Estado actual: {couponStatusLabel(coupon.status)}. Estado solicitado:{" "}
          {couponStatusLabel(target)}.
        </Text>
        <Text size="sm">
          {target === "inactive"
            ? "Desactivar este cupón impide nuevos usos. Sus usos registrados se conservan."
            : "El cupón participará en nuevas validaciones, sujeto a la vigencia y condiciones de su promoción."}
        </Text>
        <Text size="sm">
          Uso global registrado: {couponUsageLabel(coupon.consumedUses)}. Esta
          acción no modifica pedidos ni sus consumos.
        </Text>
        {unknown && (
          <Button variant="subtle" onClick={onCancel}>
            Volver al detalle sin reenviar
          </Button>
        )}
      </Stack>
    </ConfirmDialog>
  );
}
