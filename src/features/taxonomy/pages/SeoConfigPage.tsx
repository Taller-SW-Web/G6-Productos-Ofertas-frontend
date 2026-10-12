import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Group, Stack, TextInput, Textarea, Text } from "@mantine/core";
import { FeedbackAlert, PageHeader, SectionCard } from "../../../components/shared";
import { CampoDato } from "../components/CampoDato";
import { seoService } from "../services/seoService";
import type { SeoCategory } from "../types";

export function SeoConfigPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detalle, setDetalle] = useState<SeoCategory | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metaTitulo, setMetaTitulo] = useState("");
  const [metaDescripcion, setMetaDescripcion] = useState("");

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void seoService.obtener(id, controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      if (res) {
        setDetalle(res);
        setMetaTitulo(res.metaTitulo ?? "");
        setMetaDescripcion(res.metaDescripcion ?? "");
      }
      setCargando(false);
    });
    return () => controller.abort();
  }, [id]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!id) return;
    setGuardando(true);
    setError(null);
    try {
      const ok = await seoService.guardarMetadatos(id, metaTitulo.trim(), metaDescripcion.trim(), new AbortController().signal);
      if (ok) navigate("/seo");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      setGuardando(false);
    }
  };

  if (!id) {
    return <FeedbackAlert semantic="error" title="Elemento no encontrado">No se indicó el elemento a configurar.</FeedbackAlert>;
  }

  const warnTitulo = metaTitulo.length > 70;
  const warnDesc = metaDescripcion.length > 160;

  return (
    <>
      <PageHeader
        title="Configurar SEO y metadatos"
        description="Edita slug y metadatos (no bloquea guardado por longitud)."
        breadcrumbs={[{ label: "Taxonomía", to: "/seo" }, { label: "SEO", to: "/seo" }, { label: "Configurar" }]}
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">La edición es simulada. No persiste datos reales.</FeedbackAlert>
        {error && <FeedbackAlert semantic="error" title="Error">{error}</FeedbackAlert>}
        {cargando && <Text size="sm">Cargando...</Text>}
        {detalle && !cargando && (
          <SectionCard title="Slug (propuesta/actual)">
            <Stack gap="sm">
              <CampoDato etiqueta="Slug actual">{detalle.slug}</CampoDato>
              <CampoDato etiqueta="Colisión resuelta">{detalle.colisionResuelta ? "Sí" : "No"}</CampoDato>
              {detalle.slugAnterior && <CampoDato etiqueta="Slug anterior">{detalle.slugAnterior}</CampoDato>}
            </Stack>
          </SectionCard>
        )}
        {detalle && !cargando && (
          <SectionCard title="Metadatos SEO">
            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                <TextInput label="Meta-título" value={metaTitulo} onChange={(e) => setMetaTitulo(e.currentTarget.value)} disabled={guardando} />
                {warnTitulo && <Text size="xs" c="orange">Advertencia: supera 70 caracteres ({metaTitulo.length})</Text>}
                <Textarea label="Meta-descripción" value={metaDescripcion} onChange={(e) => setMetaDescripcion(e.currentTarget.value)} autosize minRows={2} disabled={guardando} />
                {warnDesc && <Text size="xs" c="orange">Advertencia: supera 160 caracteres ({metaDescripcion.length})</Text>}
                <Group justify="flex-end" gap="sm">
                  <Button variant="outline" onClick={() => navigate("/seo")} disabled={guardando}>Cancelar</Button>
                  <Button type="submit" loading={guardando}>Guardar</Button>
                </Group>
              </Stack>
            </form>
          </SectionCard>
        )}
        {detalle && !cargando && (
          <SectionCard title="Historial de slugs">
            <Stack gap="xs">
              <Text size="xs">Marketplace utiliza esta resolución para redirección permanente (301).</Text>
              <Text size="sm" c="dimmed">Consultar historial asociado (simulado).</Text>
            </Stack>
          </SectionCard>
        )}
      </Stack>
    </>
  );
}
