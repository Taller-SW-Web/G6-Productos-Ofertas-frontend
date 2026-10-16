import { useEffect, useRef, useState } from "react";
import { Badge, Button, Group, Stack, Table, Text } from "@mantine/core";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ComboAvailability } from "../components/ComboAvailability";
import { useCombosRuntime } from "../hooks/useCombosRuntime";
import { formatMoney } from "../services/comboRules";
import { availabilityMessage, hasVerifiedPositiveAvailability } from "../services/availability";
import { RequestIdentity } from "../services/requestIdentity";
import { EmptyState, FeedbackAlert, PageHeader, SectionCard, ConfirmDialog } from "../../../components/shared";
import type { Combo } from "../types/combos";

type DetailState =
  | { key: string; status: "loading" }
  | { key: string; status: "error"; message: string }
  | { key: string; status: "success"; combo: Combo | null };

export function ComboDetailPage({ unavailable = false }: { unavailable?: boolean }) {
  const { comboId = "" } = useParams();
  return <ComboDetailForId key={comboId} comboId={comboId} unavailable={unavailable} />;
}

function ComboDetailForId({ comboId, unavailable }: { comboId: string; unavailable: boolean }) {
  const { combos } = useCombosRuntime();
  const [params] = useSearchParams();
  const scenario = params.get("scenario");
  const [state, setState] = useState<DetailState>({ key: "", status: "loading" });
  const [retry, setRetry] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const identity = useRef(new RequestIdentity());
  const requestKey = JSON.stringify([comboId, retry, scenario]);

  useEffect(() => {
    const controller = new AbortController();
    const requests = identity.current;
    const requestId = requests.begin();
    void combos.getById(comboId, controller.signal).then((value) => {
      if (!requests.isCurrent(requestId, controller.signal)) return;
      if (!value) {
        setState({ key: requestKey, status: "success", combo: null });
        return;
      }
      const combo = structuredClone(value);
      if (scenario === "detail-active-zero" || scenario === "unavailable-zero-stock") combo.availability = { ...combo.availability, verifiable: true, quantity: 0, freshness: "ACTUALIZADA" };
      if (scenario === "detail-stale") combo.availability = { ...combo.availability, verifiable: true, quantity: 4, freshness: "DESACTUALIZADA" };
      if (scenario === "detail-incomplete") combo.availability = { ...combo.availability, verifiable: true, quantity: null, freshness: "INCOMPLETA" };
      if (scenario === "detail-unverifiable" || scenario === "unavailable-unknown") combo.availability = { ...combo.availability, verifiable: false, quantity: null };
      if (scenario === "detail-inactive" || scenario === "unavailable-inactive") combo.status = "INACTIVO";
      setState({ key: requestKey, status: "success", combo });
    }).catch((reason: unknown) => {
      if (requests.isCurrent(requestId, controller.signal)) {
        setState({ key: requestKey, status: "error", message: reason instanceof Error ? reason.message : "No se pudo consultar el combo." });
      }
    });
    return () => {
      controller.abort();
      requests.invalidate();
    };
  }, [comboId, combos, requestKey, scenario]);

  async function deactivate() {
    const combo = state.status === "success" ? state.combo : null;
    if (!combo || submitting) return;
    setSubmitting(true);
    setMutationError(null);
    try {
      const updated = await combos.deactivate(combo.id);
      setState((current) => current.key === requestKey && current.status === "success" ? { ...current, combo: updated } : current);
      setConfirm(false);
    } catch (reason) {
      setMutationError(reason instanceof Error ? reason.message : "No se pudo desactivar el combo.");
    } finally {
      setSubmitting(false);
    }
  }

  const combo = state.key === requestKey && state.status === "success" ? state.combo : null;
  const isLoading = state.key !== requestKey || state.status === "loading";
  const error = state.key === requestKey && state.status === "error" ? state.message : null;
  const breadcrumbs = [{ label: "Combos", to: "/combos" }, { label: combo?.name ?? "Detalle" }];

  if (isLoading) return <><PageHeader title="Detalle del combo" breadcrumbs={breadcrumbs} /><Text role="status">Cargando detalle…</Text></>;
  if (error) return <FeedbackAlert semantic="error" title="No se pudo consultar el combo" actions={<Button variant="outline" onClick={() => setRetry((value) => value + 1)}>Reintentar</Button>}>{error}</FeedbackAlert>;
  if (!combo) return <><PageHeader title="Combo no encontrado" breadcrumbs={[{ label: "Combos", to: "/combos" }, { label: "No encontrado" }]} /><EmptyState title="No encontramos ese combo" description="La referencia puede no existir o ya no estar disponible." action={<Button component={Link} to="/combos">Volver a combos</Button>} /></>;

  if (unavailable && hasVerifiedPositiveAvailability(combo)) {
    return <Navigate to={`/combos/${combo.id}`} replace />;
  }

  const availability = availabilityMessage(combo);
  const regularTotal = combo.components.every((item) => item.regularUnitMinor !== null)
    ? combo.components.reduce((sum, item) => sum + (item.regularUnitMinor ?? 0) * item.quantity, 0)
    : null;
  const publicTotal = combo.components.every((item) => item.publicUnitMinor !== null)
    ? combo.components.reduce((sum, item) => sum + (item.publicUnitMinor ?? 0) * item.quantity, 0)
    : null;
  const isUnavailable = combo.status === "INACTIVO" || !hasVerifiedPositiveAvailability(combo);
  const availabilityExplanation = combo.status === "INACTIVO"
    ? "La definición administrativa se conserva y no se ofrece para nuevas ventas."
    : combo.availability.verifiable && combo.availability.freshness === "ACTUALIZADA" && combo.availability.quantity === 0
      ? "La disponibilidad estimada es informativa; el combo conserva su estado administrativo."
      : "La disponibilidad no está confirmada como actual. El combo no tiene saldo propio ni stock garantizado.";

  return <>
    <PageHeader title={unavailable ? "Combo no disponible" : combo.name} description={combo.description ?? undefined} breadcrumbs={breadcrumbs} actions={<Group><Button component={Link} to={`/combos/${combo.id}/editar`} variant="outline">Editar</Button>{combo.status === "ACTIVO" && !unavailable && <Button color="danger" onClick={() => setConfirm(true)}>Desactivar combo</Button>}</Group>} />
    {mutationError && <FeedbackAlert semantic="error" title="No se pudo desactivar el combo">{mutationError}</FeedbackAlert>}
    {isUnavailable && <FeedbackAlert semantic={availability.semantic === "neutral" ? "info" : availability.semantic} title={availability.label}>{availabilityExplanation}</FeedbackAlert>}
    <Stack mt="lg" gap="lg">
      <SectionCard title="Resumen comercial">
        <Group gap="xl" wrap="wrap"><div><Text size="sm" c="dimmed">Estado</Text><Badge variant="light" color="gray">{combo.status}</Badge></div><div><Text size="sm" c="dimmed">Precio comercial</Text><Text fw={600}>{formatMoney(combo.priceMinor)}</Text></div><div><Text size="sm" c="dimmed">Suma regular</Text><Text fw={600}>{formatMoney(regularTotal)}</Text></div><div><Text size="sm" c="dimmed">Suma pública vigente</Text><Text fw={600}>{formatMoney(publicTotal)}</Text></div><div><Text size="sm" c="dimmed">Disponibilidad estimada</Text><ComboAvailability combo={combo} /></div></Group>
        {combo.availability.calculatedAt && <Text size="sm" c="dimmed" mt="md">Cálculo registrado: {new Date(combo.availability.calculatedAt).toLocaleString("es-PE")}</Text>}
      </SectionCard>
      <SectionCard title="Componentes">
        <Table.ScrollContainer minWidth={600}><Table><Table.Thead><Table.Tr><Table.Th>Producto</Table.Th><Table.Th>SKU vendible</Table.Th><Table.Th>Cantidad</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{combo.components.map((item) => <Table.Tr key={item.sku}><Table.Td>{item.productName}</Table.Td><Table.Td>{item.sku}</Table.Td><Table.Td>{item.quantity}</Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>
      </SectionCard>
      <Group>{unavailable && <Button component={Link} to={`/combos/${combo.id}`} variant="outline">Ver definición</Button>}{!unavailable && isUnavailable && <Button component={Link} to={`/combos/${combo.id}/no-disponible`} variant="outline">Ver situación de disponibilidad</Button>}<Button component={Link} to="/combos" variant="subtle">Volver a combos</Button></Group>
    </Stack>
    <ConfirmDialog opened={confirm} title="Desactivar combo" confirmLabel="Desactivar combo" destructive submitting={submitting} onCancel={() => setConfirm(false)} onConfirm={() => void deactivate()} error={mutationError ? <Text c="red" role="alert">{mutationError}</Text> : undefined}>
      <Text>El combo <strong>{combo.name}</strong> dejará de ofrecerse para nuevas ventas. Su definición histórica y sus componentes permanecerán conservados.</Text>
    </ConfirmDialog>
  </>;
}
