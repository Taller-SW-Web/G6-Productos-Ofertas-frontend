import { useEffect, useState } from "react";
import {
  Button,
  Group,
  Radio,
  Stack,
  Stepper,
  Text,
  TextInput,
} from "@mantine/core";
import { Link, useNavigate } from "react-router-dom";
import {
  FeedbackAlert,
  FileSelection,
  SectionCard,
} from "../../../components/shared";
import { usePricingContext } from "../hooks/usePricingContext";
import { usePriceImport } from "../hooks/usePriceImport";
import { PricingPageFrame } from "../components/PricingPageFrame";
import { ImportRowsTable } from "../components/ImportRowsTable";
import { UnsavedPriceGuard } from "../components/UnsavedPriceGuard";
import { useUnsavedPriceNavigation } from "../hooks/useUnsavedPriceNavigation";

export function ImportPricesPage() {
  const context = usePricingContext();
  const form = usePriceImport();
  const navigate = useNavigate();
  const [batchId, setBatchId] = useState("");
  const confirmed = form.admission.result;
  const suffix = context.suffix;
  const blocker = useUnsavedPriceNavigation(!!form.file && !confirmed, form.busy);
  useEffect(() => {
    if (confirmed)
      void navigate(`/precios/importaciones/${encodeURIComponent(confirmed)}${suffix}`);
  }, [confirmed, navigate, suffix]);
  return (
    <PricingPageFrame
      title="Importar precios"
      description="Selecciona un archivo y una política antes de solicitar su prevalidación."
      requiresTarget={false}
    >
      <UnsavedPriceGuard blocker={blocker} busy={form.busy} />
      <Stepper active={form.step}>
        <Stepper.Step
          label="Archivo y validación"
          description="Selección y política"
        />
        <Stepper.Step
          label="Revisión y confirmación"
          description="Respuesta de prevalidación"
        />
      </Stepper>
      <SectionCard
        title="Archivo de precios"
        description="Selecciona el archivo y la política de importación."
      >
        <FileSelection
          label="Seleccionar archivo de precios"
          accept=".csv,text/csv"
          value={form.file}
          onChange={form.changeFile}
          disabled={form.busy}
          description="Seleccionar otro archivo invalida la revisión anterior."
        />
        <Radio.Group
          label="Política ante errores"
          value={form.policy}
          onChange={form.changePolicy}
        >
          <Stack gap="md" mt="sm">
            <Radio
              value="all"
              label="Rechazar el lote si hay errores"
              disabled={form.busy || form.pending}
            />
            <Radio
              value="partial"
              label="Permitir resultados parciales"
              disabled={form.busy || form.pending}
            />
          </Stack>
        </Radio.Group>
        {form.pending ? (
          <>
            <FeedbackAlert semantic="warning" title="Importación pendiente de confirmación">
              Selecciona el mismo CSV para recuperar el lote con la clave anterior.
            </FeedbackAlert>
            <Button onClick={form.confirm} disabled={!form.canConfirm} loading={form.admission.busy}>
              Recuperar importación
            </Button>
          </>
        ) : (
          <>
            <Text size="sm">Cambiar de política exige revisar el archivo de nuevo.</Text>
            <Button
              style={{ alignSelf: "flex-start" }}
              variant="outline"
              disabled={!form.file || !form.policy || form.busy}
              loading={form.preview.busy}
              onClick={() => void form.prevalidate()}
            >
              Prevalidar archivo
            </Button>
          </>
        )}
        {form.preview.error && (
          <FeedbackAlert
            semantic={
              form.preview.error.kind === "blocked_contract"
                ? "warning"
                : "error"
            }
            title="Prevalidación no disponible"
          >
            {form.preview.error.message}
          </FeedbackAlert>
        )}
      </SectionCard>
      {!form.pending && form.step === 1 && form.preview.result && (
        <SectionCard title="Revisión de prevalidación">
          <Text size="sm">
            Archivo: {form.file?.name}. Política:{" "}
            {form.policy === "partial"
              ? "Permitir resultados parciales"
              : "Rechazar el lote si hay errores"}
            . Total publicado: {form.preview.result.total} filas.
          </Text>
          <FeedbackAlert
            semantic={form.preview.result.valid ? "info" : "warning"}
            title={
              form.preview.result.valid
                ? "Sin errores reportados"
                : "Errores por fila"
            }
          >
            Revisa los resultados antes de continuar.
          </FeedbackAlert>
          <ImportRowsTable
            caption="Errores de prevalidación"
            rows={form.preview.result.errors}
          />
          {!form.admissionAvailable && (
            <Text size="sm">La sesión actual no tiene acceso a la admisión de lotes.</Text>
          )}
          <Group justify="space-between">
            <Button variant="outline" onClick={form.back} disabled={form.busy}>
              Volver al archivo
            </Button>
            <Button disabled={!form.canConfirm} loading={form.admission.busy} onClick={form.confirm}>
              Confirmar importación
            </Button>
          </Group>
        </SectionCard>
      )}
      {form.admission.error && (
        <FeedbackAlert
          semantic={form.admission.error.kind === "unknown" ? "warning" : "error"}
          title="No se pudo confirmar la importación"
        >
          {form.admission.error.message}
        </FeedbackAlert>
      )}
      <SectionCard
        title="Consultar un lote existente"
        description="Utiliza la referencia recibida de una importación previamente admitida."
      >
        {form.lastBatchId && (
          <Button
            component={Link}
            to={`/precios/importaciones/${encodeURIComponent(form.lastBatchId)}${suffix}`}
            variant="outline"
            style={{ alignSelf: "flex-start" }}
          >
            Consultar último lote admitido
          </Button>
        )}
        <TextInput
          label="Referencia de lote"
          value={batchId}
          onChange={(event) => setBatchId(event.currentTarget.value)}
        />
        <Button
          component={Link}
          to={`/precios/importaciones/${encodeURIComponent(batchId.trim())}${context.suffix}`}
          disabled={!batchId.trim()}
          variant="outline"
          style={{ alignSelf: "flex-start" }}
        >
          Consultar lote
        </Button>
      </SectionCard>
    </PricingPageFrame>
  );
}
