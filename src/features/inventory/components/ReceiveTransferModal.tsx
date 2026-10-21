import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { semanticTokens } from "../../../theme/tokens";
import type {
  DispositionType,
  ReceiveTransferPayload,
  TransferItem,
} from "../services/inventoryTypes";
import {
  createTransferReceptionFormSession,
  getUncertainTransferReception,
  type TransferReceptionFormSession,
} from "../services/transferReceptionAttempt";

interface ReceiveTransferModalProps {
  transfer: TransferItem | null;
  opened: boolean;
  submitting: boolean;
  submitError?: string | null;
  onClose: () => void;
  onConfirm: (payload: ReceiveTransferPayload) => Promise<void>;
}

interface TransferFormInnerProps {
  transfer: TransferItem;
  submitting: boolean;
  submitError?: string | null;
  onClose: () => void;
  onConfirm: (payload: ReceiveTransferPayload) => Promise<void>;
}

function TransferFormInner({
  transfer,
  submitting,
  submitError,
  onClose,
  onConfirm,
}: TransferFormInnerProps) {
  const sessionRef = useRef<TransferReceptionFormSession>(
    createTransferReceptionFormSession(transfer.id),
  );
  const [uncertainAttempt, setUncertainAttempt] =
    useState<Readonly<ReceiveTransferPayload> | null>(() =>
      getUncertainTransferReception(transfer.id),
    );
  const [quantity, setQuantity] = useState<number | string>(() => {
    const uncertain = getUncertainTransferReception(transfer.id);
    return uncertain ? uncertain.quantityReceived : transfer.quantityPending;
  });
  const [disposition, setDisposition] = useState<DispositionType>(() => {
    const uncertain = getUncertainTransferReception(transfer.id);
    return uncertain ? uncertain.disposition : "REINGRESAR_DISPONIBLE";
  });
  const [finalReceipt, setFinalReceipt] = useState<boolean>(() => {
    const uncertain = getUncertainTransferReception(transfer.id);
    return uncertain ? uncertain.finalReceipt : true;
  });
  const [note, setNote] = useState<string>(
    () => getUncertainTransferReception(transfer.id)?.note ?? "",
  );
  const [errorValidation, setErrorValidation] = useState<string | null>(null);

  const isUncertainLocked = uncertainAttempt !== null;
  const numQty = Number(quantity);
  const isMissing = finalReceipt && numQty < transfer.quantityPending;
  const missingCount = transfer.quantityPending - numQty;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(numQty) || !Number.isInteger(numQty) || numQty <= 0) {
      setErrorValidation(
        "La cantidad recibida debe ser un número entero mayor que cero.",
      );
      return;
    }
    if (numQty > transfer.quantityPending) {
      setErrorValidation(
        `La cantidad recibida (${numQty}) no puede ser mayor que la cantidad pendiente (${transfer.quantityPending}).`,
      );
      return;
    }
    if (note.trim().length > 500) {
      setErrorValidation(
        "La nota de recepción no puede superar los 500 caracteres.",
      );
      return;
    }

    setErrorValidation(null);

    let payload: Readonly<ReceiveTransferPayload>;
    try {
      payload = sessionRef.current.prepareSubmission({
        quantityReceived: numQty,
        disposition,
        finalReceipt,
        note,
      });
    } catch (err) {
      setErrorValidation(
        err instanceof Error
          ? err.message
          : "No se puede modificar una recepción con resultado incierto.",
      );
      return;
    }

    try {
      await onConfirm(payload);
      sessionRef.current.recordSuccess(payload);
      setUncertainAttempt(null);
      onClose();
    } catch (err) {
      // TAC-P0-01 / TAC-P0-02: si el intento quedó en RESULTADO_INCIERTO se
      // conserva el snapshot inmutable completo (operationId, receivedAt, note,
      // cantidad, disposición y recepción final) incluso si el modal se cierra.
      const locked = sessionRef.current.recordFailure(payload, err);
      setUncertainAttempt(locked);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <div
          style={{
            background: semanticTokens.neutral.background,
            padding: 12,
            borderRadius: 8,
          }}
        >
          <Group justify="space-between" mb={4}>
            <Text size="sm" fw={600}>
              {transfer.productName}
            </Text>
            <Text size="xs" c="dimmed">
              SKU: {transfer.sku}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            Origen:{" "}
            <Text span fw={500}>
              {transfer.sourceLocationName}
            </Text>{" "}
            • Destino:{" "}
            <Text span fw={500}>
              {transfer.targetLocationName}
            </Text>
          </Text>
          <Group gap="lg" mt="xs">
            <Text size="xs">
              Despachado:{" "}
              <Text span fw={600}>
                {transfer.quantityShipped}
              </Text>
            </Text>
            <Text size="xs">
              Ya recibido:{" "}
              <Text span fw={600}>
                {transfer.quantityReceived}
              </Text>
            </Text>
            <Text size="xs">
              Pendiente:{" "}
              <Text span fw={700}>
                {transfer.quantityPending}
              </Text>
            </Text>
          </Group>
        </div>

        {isUncertainLocked && (
          <Alert
            icon={<IconAlertTriangle size={16} />}
            title="Operación con resultado incierto pendiente de confirmación"
            color="orange"
          >
            El envío anterior ({uncertainAttempt.operationId}) no recibió
            confirmación definitiva. Los valores de la solicitud quedaron
            bloqueados de forma inmutable para que el reintento consulte o
            recupere exactamente la misma operación sin duplicar saldos.
          </Alert>
        )}

        <NumberInput
          label="Cantidad recibida físicamente"
          description={`Máximo pendiente: ${transfer.quantityPending} unidades.`}
          min={1}
          max={transfer.quantityPending}
          allowDecimal={false}
          allowNegative={false}
          value={quantity}
          onChange={setQuantity}
          required
          disabled={submitting || isUncertainLocked}
          aria-label="Cantidad recibida físicamente"
        />

        <Select
          label="Disposición de las unidades recibidas"
          description="Destino contable y operativo del inventario recibido."
          data={[
            {
              value: "REINGRESAR_DISPONIBLE",
              label: "Reingresar a disponible (Aptas para venta)",
            },
            {
              value: "REINGRESAR_BLOQUEADO",
              label: "Reingresar bloqueado (Cuarentena / Incidencia)",
            },
            {
              value: "CONFIRMAR_MERMA",
              label: "Confirmar merma (Dañadas / No vendibles)",
            },
          ]}
          value={disposition}
          onChange={(val) =>
            setDisposition((val as DispositionType) ?? "REINGRESAR_DISPONIBLE")
          }
          disabled={submitting || isUncertainLocked}
          required
          aria-label="Disposición de unidades recibidas"
        />

        <Checkbox
          label="Marcar como recepción final del traslado"
          description="Si quedan unidades sin recibir, el traslado se cerrará como completado con discrepancia."
          checked={finalReceipt}
          onChange={(e) => setFinalReceipt(e.currentTarget.checked)}
          disabled={submitting || isUncertainLocked}
        />

        {isMissing && (
          <Alert
            icon={<IconAlertTriangle size={16} />}
            title="Aviso de discrepancia"
            color="orange"
          >
            Se registrará una recepción final con discrepancia de{" "}
            <strong>{missingCount} unidades faltantes</strong>. El traslado
            cerrará como completado con discrepancia y se emitirá una alerta sin
            acreditar dicho saldo.
          </Alert>
        )}

        {errorValidation && (
          <Alert color="red" title="Error de validación">
            {errorValidation}
          </Alert>
        )}

        {submitError && (
          <Alert
            icon={<IconAlertTriangle size={16} />}
            color="red"
            title="No se pudo registrar la recepción"
          >
            {submitError}
          </Alert>
        )}

        <Textarea
          label="Nota u observación de recepción (opcional, max. 500 caracteres)"
          placeholder="Ej: Embalaje exterior en buen estado, 2 unidades con empaque deteriorado..."
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.currentTarget.value)}
          disabled={submitting || isUncertainLocked}
          rows={2}
        />

        <Group justify="flex-end" gap="sm" mt="md">
          <Button
            variant="outline"
            color="gray"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={submitting}
            leftSection={<IconCheck size={16} />}
            color={isMissing ? "orange" : "primary"}
          >
            {isMissing
              ? "Confirmar recepción con discrepancia"
              : "Confirmar recepción"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function ReceiveTransferModal({
  transfer,
  opened,
  submitting,
  submitError,
  onClose,
  onConfirm,
}: ReceiveTransferModalProps) {
  if (!transfer) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Registrar recepción — ${transfer.transferCode}`}
      size="lg"
      aria-label="Registrar recepción de traslado"
    >
      <TransferFormInner
        key={transfer.id}
        transfer={transfer}
        submitting={submitting}
        submitError={submitError}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    </Modal>
  );
}
