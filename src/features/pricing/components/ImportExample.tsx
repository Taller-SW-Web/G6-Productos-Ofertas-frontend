import { useState } from "react";
import { Button, Group, Radio, Stack, Stepper, Text } from "@mantine/core";
import {
  FeedbackAlert,
  FileSelection,
  SectionCard,
} from "../../../components/shared";

export function ImportExample() {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState(0);
  const [policy, setPolicy] = useState<string | null>(null);
  const updateFile = (value: File | null) => {
    setFile(value);
    setStep(0);
    setPolicy(null);
  };
  return (
    <Stack gap="lg">
      <Stepper
        active={step}
        onStepClick={(value) => {
          if (value === 0) setStep(0);
        }}
      >
        <Stepper.Step
          label="Archivo y validación"
          description="Selección del archivo"
        />
        <Stepper.Step
          label="Revisión y confirmación"
          description="Política y resultado"
        />
      </Stepper>
      <FeedbackAlert semantic="warning" title="Contrato de archivo pendiente">
        Q-013-01 y Q-013-02 siguen abiertos. No se valida contenido, no se
        declaran cabeceras o tamaños aceptados y no se confirma una importación.
      </FeedbackAlert>
      <SectionCard
        title="Archivo de precios"
        description="Muestra de S04; la selección no acredita que el archivo sea válido."
      >
        <FileSelection
          label="Seleccionar archivo de precios"
          value={file}
          onChange={updateFile}
          description="Formatos y reglas pendientes de la definición del owner de Pricing."
        />
        {!file && (
          <Text size="sm">
            Selecciona un archivo para revisar la segunda etapa de presentación.
          </Text>
        )}
        <Button variant="outline" disabled={!file} onClick={() => setStep(1)}>
          Revisar selección de archivo
        </Button>
      </SectionCard>
      {step === 1 && (
        <SectionCard title="Revisión de la política">
          <Radio.Group
            label="Política ante errores"
            value={policy ?? ""}
            onChange={setPolicy}
          >
            <Stack gap="md" mt="sm">
              <Radio value="partial" label="Permitir resultados parciales" />
              <Radio value="all" label="Rechazar el lote si hay errores" />
            </Stack>
          </Radio.Group>
          <Text size="sm">
            Esta elección es solo una muestra. Cambiar el archivo reinicia la
            revisión.
          </Text>
          <Group justify="space-between">
            <Button variant="outline" onClick={() => setStep(0)}>
              Volver al archivo
            </Button>
            <Button disabled>Confirmar importación</Button>
          </Group>
          <Text size="sm">
            Confirmación deshabilitada: el contrato de archivo y la política de
            admisión con errores no están definidos.
          </Text>
        </SectionCard>
      )}
    </Stack>
  );
}
