import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Group, Select, Stack, TextInput, Textarea } from "@mantine/core";
import { FeedbackAlert, PageHeader, SectionCard } from "../../../components/shared";
import { brandService } from "../services/brandService";
import type { BrandDetail } from "../types";

const PAISES = [
  { value: "US", label: "Estados Unidos (US)" },
  { value: "DE", label: "Alemania (DE)" },
  { value: "FR", label: "Francia (FR)" },
  { value: "IT", label: "Italia (IT)" },
  { value: "ES", label: "España (ES)" },
  { value: "AR", label: "Argentina (AR)" },
  { value: "CL", label: "Chile (CL)" },
  { value: "CO", label: "Colombia (CO)" },
  { value: "MX", label: "México (MX)" },
  { value: "BR", label: "Brasil (BR)" },
];

export function BrandFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const esEdicion = Boolean(id);
  const [detalle, setDetalle] = useState<BrandDetail | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState<string>("");
  const [paisOrigenIso, setPaisOrigenIso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(esEdicion);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void brandService.obtener(id, controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      if (res) {
        setDetalle(res);
        setNombre(res.nombre);
        setDescripcion(res.descripcion ?? "");
        setPaisOrigenIso(res.paisOrigenIso ?? null);
      }
      setCargando(false);
    });
    return () => controller.abort();
  }, [id]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) {
      setError("Ingresa el nombre de la marca.");
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      if (esEdicion && id) {
        await brandService.actualizar({
          marcaId: id,
          nombre: limpio,
          descripcion: descripcion.trim() || null,
          paisOrigenIso: paisOrigenIso,
        }, new AbortController().signal);
        navigate(`/marcas/${id}`);
      } else {
        const creado = await brandService.crear({
          nombre: limpio,
          descripcion: descripcion.trim() || null,
          paisOrigenIso: paisOrigenIso,
        }, new AbortController().signal);
        navigate(`/marcas/${creado.marcaId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la marca.");
      setGuardando(false);
    }
  };

  return (
    <>
      <PageHeader
        title={esEdicion ? "Editar marca" : "Nueva marca"}
        description={esEdicion ? "Actualiza los datos de la marca." : "Registra una nueva marca."}
        breadcrumbs={[
          { label: "Taxonomía", to: "/marcas" },
          { label: "Marcas", to: "/marcas" },
          { label: esEdicion ? "Editar" : "Nueva" },
        ]}
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">
          El formulario es simulado. No guarda marcas reales.
        </FeedbackAlert>
        {error && (
          <FeedbackAlert semantic="error" title="No se pudo guardar la marca">
            {error}
          </FeedbackAlert>
        )}
        <SectionCard title="Datos de la marca">
          <form onSubmit={handleSubmit} noValidate>
            <Stack gap="md">
              <TextInput
                label="Nombre"
                withAsterisk
                value={nombre}
                onChange={(e) => setNombre(e.currentTarget.value)}
                disabled={cargando || guardando}
              />
              <Textarea
                label="Descripción (opcional)"
                value={descripcion}
                onChange={(e) => setDescripcion(e.currentTarget.value)}
                autosize
                minRows={3}
                disabled={cargando || guardando}
              />
              <Select
                label="País de origen (ISO 3166-1, opcional)"
                placeholder="Selecciona un país"
                data={PAISES}
                value={paisOrigenIso}
                clearable
                onChange={(v) => setPaisOrigenIso(v)}
                disabled={cargando || guardando}
              />
              <TextInput
                label="Logo (URL, opcional)"
                value={detalle?.logoUrl ?? ""}
                disabled
                description="La carga de archivos se simula en este piloto."
              />
              <Group justify="flex-end" gap="sm">
                <Button variant="outline" onClick={() => navigate("/marcas")} disabled={guardando}>
                  Cancelar
                </Button>
                <Button type="submit" loading={guardando} disabled={cargando}>
                  {esEdicion ? "Guardar cambios" : "Crear marca"}
                </Button>
              </Group>
            </Stack>
          </form>
        </SectionCard>
      </Stack>
    </>
  );
}
