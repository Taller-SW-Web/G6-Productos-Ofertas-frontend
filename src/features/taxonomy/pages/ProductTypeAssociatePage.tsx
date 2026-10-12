import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Group, Radio, Select, Stack, Text } from "@mantine/core";
import { FeedbackAlert, PageHeader, SectionCard } from "../../../components/shared";

const CARACTERISTICAS_DISPONIBLES = [
  { value: "peso", label: "Peso — Número (kg)" },
  { value: "suela", label: "Tipo de suela — Lista" },
  { value: "amortiguacion", label: "Tecnología de amortiguación — Texto" },
];

export function ProductTypeAssociatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [caracteristicaId, setCaracteristicaId] = useState<string | null>(null);
  const [condicion, setCondicion] = useState<"obligatoria" | "opcional">(
    "obligatoria",
  );
  const [guardando, setGuardando] = useState(false);

  if (!id) {
    return (
      <FeedbackAlert semantic="error" title="Tipo de producto no encontrado">
        La dirección no incluye un tipo de producto.
      </FeedbackAlert>
    );
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGuardando(true);
    setTimeout(() => {
      navigate(`/tipos-producto/${id}`);
    }, 300);
  };

  return (
    <>
      <PageHeader
        title="Asociar característica"
        description="Selecciona una característica activa no asociada y define su condición."
        breadcrumbs={[
          { label: "Catálogo", to: "/tipos-producto" },
          { label: "Tipos de producto", to: "/tipos-producto" },
          { label: id, to: `/tipos-producto/${id}` },
          { label: "Asociar" },
        ]}
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">
          La asociación es simulada. No modifica datos reales.
        </FeedbackAlert>
        <SectionCard
          title="Asociar característica al tipo de producto"
          description="Solo se muestran características activas que aún no están asociadas."
        >
          <form onSubmit={handleSubmit} noValidate>
            <Stack gap="md">
              <Select
                label="Característica activa"
                placeholder="Selecciona una característica"
                data={CARACTERISTICAS_DISPONIBLES}
                value={caracteristicaId}
                onChange={(value) => setCaracteristicaId(value)}
                withAsterisk
              />
              <Stack gap="xs">
                <Text size="sm" fw={600}>
                  Condición
                </Text>
                <Radio.Group
                  value={condicion}
                  onChange={(value) =>
                    setCondicion(value as "obligatoria" | "opcional")
                  }
                >
                  <Stack gap="xs">
                    <Radio
                      value="obligatoria"
                      label="Obligatoria"
                      description="Se exigirá al volver a guardar o activar los productos que correspondan."
                    />
                    <Radio value="opcional" label="Opcional" />
                  </Stack>
                </Radio.Group>
              </Stack>
              <Group justify="flex-end" gap="sm">
                <Button
                  variant="outline"
                  onClick={() => navigate(`/tipos-producto/${id}`)}
                  disabled={guardando}
                >
                  Cancelar
                </Button>
                <Button type="submit" loading={guardando}>
                  Asociar
                </Button>
              </Group>
            </Stack>
          </form>
        </SectionCard>
      </Stack>
    </>
  );
}
