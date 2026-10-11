import { Button, Group, Radio, Stack, Stepper, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import {
  FeedbackAlert,
  FileSelection,
  SectionCard,
} from "../../../components/shared";
import { usePricingContext } from "../hooks/usePricingContext";
import { usePriceImport } from "../hooks/usePriceImport";
import { PricingPageFrame } from "../components/PricingPageFrame";
import { PricingScenarioControl } from "../components/PricingScenarioControl";
import { ImportRowsTable } from "../components/ImportRowsTable";
import { UnsavedPriceGuard } from "../components/UnsavedPriceGuard";
import { useUnsavedPriceNavigation } from "../hooks/useUnsavedPriceNavigation";

export function ImportPricesPage() {
  const context = usePricingContext();
  const form = usePriceImport();
  const blocker = useUnsavedPriceNavigation(!!form.file, form.preview.busy);
  return (
    <PricingPageFrame
      title="Importar precios"
      description="Selecciona un archivo y revisa las respuestas de prevalidación disponibles para demostración."
    >
      <UnsavedPriceGuard blocker={blocker} busy={form.preview.busy} />
      <FeedbackAlert
        semantic="warning"
        title="Contrato de importación pendiente"
      >
        Q-013-01: falta definir el contenido del archivo. Q-013-02: falta
        precisar la admisión con errores parciales. La selección no valida el
        contenido; la confirmación de importación permanece bloqueada.
      </FeedbackAlert>
      <Text size="sm">
        Alcance exclusivo de Pricing: no crea productos ni modifica inventario.
        La carga no promete una transacción con otros dominios.
      </Text>
      <Stepper active={form.step}>
        <Stepper.Step
          label="Archivo y validación"
          description="Selección y política"
        />
        <Stepper.Step
          label="Revisión y confirmación"
          description="Respuesta de ejemplo"
        />
      </Stepper>
      <SectionCard
        title="Archivo de precios"
        description="No se fijan formatos, cabeceras ni límites sin contrato publicado."
      >
        <FileSelection
          label="Seleccionar archivo de precios"
          value={form.file}
          onChange={form.changeFile}
          disabled={form.preview.busy}
          description="Los bytes del archivo no se analizan ni se envían. Seleccionar otro archivo invalida la revisión."
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
              disabled={form.preview.busy}
            />
            <Radio
              value="partial"
              label="Permitir resultados parciales"
              disabled={form.preview.busy}
            />
          </Stack>
        </Radio.Group>
        <Text size="sm">
          Cambiar de política exige una nueva revisión. Su elección no habilita
          admisión con errores.
        </Text>
        <PricingScenarioControl
          visible={context.review}
          label="Respuesta ficticia de prevalidación"
          value={form.scenario}
          onChange={form.changeScenario}
          options={[
            { value: "valid", label: "Sin errores reportados" },
            { value: "rows", label: "Error por fila" },
            { value: "unreadable", label: "Archivo no analizable" },
            { value: "error", label: "Error de consulta" },
          ]}
        />
        <Button
          style={{ alignSelf: "flex-start" }}
          variant="outline"
          disabled={!form.file || !form.policy || form.preview.busy}
          loading={form.preview.busy}
          onClick={() => void form.simulate()}
        >
          Simular respuesta de prevalidación
        </Button>
        {!form.file || !form.policy ? (
          <Text size="sm">
            Selecciona un archivo y una política para revisar la respuesta
            ficticia.
          </Text>
        ) : (
          <Text size="sm">
            La respuesta usa un fixture independiente del archivo seleccionado;
            no acredita que ese archivo sea válido.
          </Text>
        )}
        {form.preview.error && (
          <FeedbackAlert semantic="error" title="Prevalidación no disponible">
            {form.preview.error.message}
          </FeedbackAlert>
        )}
      </SectionCard>
      {form.step === 1 && form.preview.result && (
        <SectionCard title="Revisión de la respuesta ficticia">
          <Text size="sm">
            Selección: {form.file?.name}. Política:{" "}
            {form.policy === "partial"
              ? "Permitir resultados parciales"
              : "Rechazar el lote si hay errores"}
            . Total publicado por el fixture: {form.preview.result.total} filas.
          </Text>
          <FeedbackAlert
            semantic={form.preview.result.valid ? "info" : "warning"}
            title={
              form.preview.result.valid
                ? "Fixture sin errores"
                : "Fixture con errores por fila"
            }
          >
            No se detectaron ni validaron filas del archivo elegido.{" "}
            {form.preview.result.errors.length > 0 &&
              "La política parcial no autoriza continuar mientras Q-013-02 siga abierto."}
          </FeedbackAlert>
          <ImportRowsTable
            caption="Errores de la prevalidación ficticia"
            rows={form.preview.result.errors}
          />
          <Group justify="space-between">
            <Button variant="outline" onClick={form.back}>
              Volver al archivo
            </Button>
            <Button disabled>Confirmar importación</Button>
          </Group>
          <Text size="sm">
            Confirmación deshabilitada por Q-013-01/02. No se ha creado ningún
            lote.
          </Text>
        </SectionCard>
      )}
      <SectionCard
        title="Seguimiento de demostración"
        description="Puedes consultar un lote ficticio existente, independiente de esta selección."
      >
        <Button
          style={{ alignSelf: "flex-start" }}
          component={Link}
          to={`/precios/importaciones/batch-013-01${context.suffix}`}
          variant="outline"
        >
          Consultar lote de ejemplo
        </Button>
        <Text size="sm">
          Al salir con un archivo seleccionado, se solicitará descartar la
          selección. El lote de ejemplo no surge de esa importación.
        </Text>
      </SectionCard>
    </PricingPageFrame>
  );
}
