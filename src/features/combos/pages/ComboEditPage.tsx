import { useEffect, useState } from "react";
import { Button, Skeleton } from "@mantine/core";
import { Link, useParams } from "react-router-dom";
import { EmptyState, FeedbackAlert, PageHeader } from "../../../components/shared";
import { ComboEditor } from "../components/ComboEditor";
import { useCombosRuntime } from "../hooks/useCombosRuntime";
import type { Combo } from "../types/combos";

export function ComboEditPage() {
  const { comboId = "" } = useParams();
  const { combos } = useCombosRuntime();
  const [combo, setCombo] = useState<Combo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const controller = new AbortController(); void combos.getById(comboId, controller.signal).then(setCombo).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo consultar el combo.")).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [comboId, combos]);
  return <>
    <PageHeader title="Editar combo" breadcrumbs={[{ label: "Combos", to: "/combos" }, { label: combo?.name ?? "Combo" }]} actions={<Button component={Link} to={`/combos/${comboId}`} variant="outline">Volver al detalle</Button>} />
    {loading ? <Skeleton height={300} /> : error ? <FeedbackAlert semantic="error" title="No se pudo consultar el combo">{error}</FeedbackAlert> : combo ? <ComboEditor existing={combo} /> : <EmptyState title="Combo no encontrado" description="La referencia no corresponde a un combo disponible." action={<Button component={Link} to="/combos">Volver a combos</Button>} />}
  </>;
}
