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

interface ReceiveTransferModalProps {
  transfer: TransferItem | null;
  opened: boolean;
  submitting: boolean;
  submitError?: string | null;
  onClose: () => void;
  onConfirm: (payload: ReceiveTransferPayload) => Promise<void>;
}

function createOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
  const operationIdRef = useRef<string>(createOperationId());
  // Rastrea si ya se intentó una operación y cuál fue su intención. La intención
  // replica exactamente la del contrato/repositorio (transferId, cantidad,
  // disposición y cierre final); la nota NO forma parte de la intención.
  const attemptedRef = useRef(false);
  const lastIntentRef = useRef<string | null>(null);
  const [quantity, setQuantity] = useState<number | string>(
    transfer.quantityPending,
  );
  const [disposition, setDisposition] = useState<DispositionType>(
    "REINGRESAR_DISPONIBLE",
  );
  const [finalReceipt, setFinalReceipt] = useState<boolean>(true);
  const [note, setNote] = useState<string>("");
  const [errorValidation, setErrorValidation] = useState<string | null>(null);

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

    // Conservar el operationId solo para reintentar EXACTAMENTE la misma
    // operación. Si tras un intento cambia la intención (cantidad, disposición
    // o cierre final), se genera una nueva identidad de idempotencia.
    const intent = `${numQty}|${disposition}|${finalReceipt}`;
    if (attemptedRef.current && intent !== lastIntentRef.current) {
      operationIdRef.current = createOperationId();
    }
    lastIntentRef.current = intent;
    attemptedRef.current = true;

    try {
      await onConfirm({
        transferId: transfer.id,
        quantityReceived: numQty,
        disposition,
        finalReceipt,
        operationId: operationIdRef.current,
        receivedAt: new Date().toISOString(),
        note: note.trim() || undefined,
      });
      onClose();
    } catch {
      // El error se maneja en el hook/parent; operationId se conserva para
      // reintentar la MISMA operación.
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
          disabled={submitting}
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
          disabled={submitting}
          required
          aria-label="Disposición de unidades recibidas"
        />

        <Checkbox
          label="Marcar como recepción final del traslado"
          description="Si quedan unidades sin recibir, el traslado se cerrará como completado con discrepancia."
          checked={finalReceipt}
          onChange={(e) => setFinalReceipt(e.currentTarget.checked)}
          disabled={submitting}
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
          disabled={submitting}
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
