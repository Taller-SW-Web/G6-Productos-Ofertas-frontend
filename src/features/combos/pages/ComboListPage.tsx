import { useCallback, useEffect, useState } from "react";
import { Button, Group, Pagination, Select, Skeleton, Table, Text } from "@mantine/core";
import { IconPlus, IconRefresh } from "@tabler/icons-react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, FeedbackAlert, PageHeader } from "../../../components/shared";
import { ComboAvailability } from "../components/ComboAvailability";
import { useCombosRuntime } from "../hooks/useCombosRuntime";
import { formatMoney } from "../services/comboRules";
import type { Combo, ComboPage } from "../types/combos";

export function ComboListPage() {
  const { combos } = useCombosRuntime();
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState<ComboPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const page = Math.max(1, Number(params.get("pagina") ?? 1));
  const status = params.get("estado") === "ACTIVO" || params.get("estado") === "INACTIVO" ? params.get("estado") as "ACTIVO" | "INACTIVO" : "TODOS";
  const scenario = params.get("scenario") ?? undefined;
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try { setResult(await combos.list({ status, page, pageSize: 5, scenario }, signal)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudieron consultar los combos."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [combos, status, page, scenario]);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => load(controller.signal)); return () => controller.abort(); }, [load]);
  function change(key: string, value: string) { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key === "estado") next.delete("pagina"); setParams(next); }
  const rows: Combo[] = result?.items ?? [];
  return <>
    <PageHeader title="Gestión de combos" description="Administra las definiciones comerciales y consulta su disponibilidad estimada." breadcrumbs={[{ label: "Catálogo", to: "/productos" }, { label: "Combos" }]} actions={<Button component={Link} to="/combos/nuevo" leftSection={<IconPlus size={18} />}>Crear combo</Button>} />
    <Group justify="space-between" mb="md"><Select aria-label="Filtrar por estado" label="Estado" value={status} data={[{ value: "TODOS", label: "Todos" }, { value: "ACTIVO", label: "Activo" }, { value: "INACTIVO", label: "Inactivo" }]} onChange={(value) => change("estado", value === "TODOS" ? "" : value ?? "")} w={220} />{error && <Button leftSection={<IconRefresh size={16} />} variant="outline" onClick={() => void load()}>Reintentar</Button>}</Group>
    {error && <FeedbackAlert semantic="error" title="No se pudieron consultar los combos">{error}</FeedbackAlert>}
    {loading ? <Table><Table.Tbody>{[0, 1, 2].map((row) => <Table.Tr key={row}><Table.Td><Skeleton height={18} /></Table.Td><Table.Td><Skeleton height={18} /></Table.Td><Table.Td><Skeleton height={18} /></Table.Td></Table.Tr>)}</Table.Tbody></Table> : !error && rows.length === 0 ? <EmptyState title="No hay combos para mostrar" description="Crea un combo para definir una oferta comercial compuesta." action={<Button component={Link} to="/combos/nuevo">Crear combo</Button>} /> : !error && <>
      <Table.ScrollContainer minWidth={900}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Combo</Table.Th><Table.Th>Precio</Table.Th><Table.Th>Componentes</Table.Th><Table.Th>Disponibilidad estimada</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Acción</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{rows.map((combo) => <Table.Tr key={combo.id}><Table.Td><Text fw={600}>{combo.name}</Text><Text size="sm" c="dimmed" lineClamp={1}>{combo.description}</Text></Table.Td><Table.Td>{formatMoney(combo.priceMinor)}</Table.Td><Table.Td>{combo.components.length} SKU</Table.Td><Table.Td><ComboAvailability combo={combo} /></Table.Td><Table.Td>{combo.status}</Table.Td><Table.Td><Button component={Link} to={`/combos/${combo.id}`} variant="subtle">Ver detalle</Button></Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>
      <Group justify="space-between" mt="md"><Text size="sm" c="dimmed">{result?.total ?? 0} combos</Text><Pagination value={page} total={Math.max(1, Math.ceil((result?.total ?? 0) / 5))} onChange={(value) => change("pagina", String(value))} /></Group>
    </>}
  </>;
}
