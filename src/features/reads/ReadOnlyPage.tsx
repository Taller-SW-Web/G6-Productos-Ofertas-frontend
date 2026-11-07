import { useContext, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button, Group, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { PageHeader, FeedbackAlert } from "../../components/shared";
import { GatewayOriginContext } from "../../app/config/GatewayOriginContext";
import { DataModeContext } from "../../app/config/DataModeContext";
import { useAuthSession } from "../../app/config/useAuthSession";
import { readOperations } from "./readOperations";
import { createReadOnlyClient, ReadFailure, requiresPublicReadChannel, type ReadResult } from "./readOnlyClient";

const modules = [...new Set(readOperations.map(item => item.module))];
const labels: Record<string, string> = { q: "Buscar", skus: "SKU (separados por comas)", sku: "SKU", pagina: "Página", tamanio: "Resultados por página", desde: "Desde (fecha y hora ISO)", hasta: "Hasta (fecha y hora ISO)", at: "Instante de consulta (fecha y hora ISO)", productoId: "ID de producto", categoriaId: "ID de categoría", marcaId: "ID de marca", batchId: "ID de lote", exportId: "ID de exportación", location_id: "ID de ubicación", locationId: "ID de ubicación", target_location_id: "ID de ubicación destino", operationId: "ID de operación", canal: "Canal", formato: "Formato" };
const label = (key: string) => labels[key] ?? (key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, value => value.toUpperCase()));
const defaults = (id: string) => Object.fromEntries(readOperations.find(item => item.id === id)!.parameters.filter(p => p.default !== undefined).map(p => [p.name, String(p.default)]));
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function ResultValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) return <Text size="sm" c="dimmed">Sin dato</Text>;
  if (typeof value === "boolean") return <Text size="sm">{value ? "Sí" : "No"}</Text>;
  if (typeof value !== "object") return <Text size="sm" style={{ overflowWrap: "anywhere" }}>{String(value)}</Text>;
  if (depth > 8) return <Text size="sm">Contenido anidado fuera del límite de esta vista.</Text>;
  if (Array.isArray(value)) {
    if (!value.length) return <Text c="dimmed">Sin resultados.</Text>;
    if (value.every(isObject)) {
      const columns = [...new Set(value.flatMap(item => Object.keys(item)))];
      return <Stack gap="xs"><Table.ScrollContainer minWidth={560}><Table striped highlightOnHover withTableBorder>
        <Table.Thead><Table.Tr>{columns.map(column => <Table.Th key={column}>{label(column)}</Table.Th>)}</Table.Tr></Table.Thead>
        <Table.Tbody>{value.slice(0, 200).map((row, index) => <Table.Tr key={index}>{columns.map(column => <Table.Td key={column} style={{ verticalAlign: "top", minWidth: 120 }}>
          {row[column] && typeof row[column] === "object" ? <details><summary>Ver detalle</summary><ResultValue value={row[column]} depth={depth + 1} /></details> : <ResultValue value={row[column]} depth={depth + 1} />}
        </Table.Td>)}</Table.Tr>)}</Table.Tbody>
      </Table></Table.ScrollContainer>{value.length > 200 && <Text size="sm">Se muestran los primeros 200 registros. Reduce el tamaño de página para revisar el resto.</Text>}</Stack>;
    }
    return <Stack gap="xs">{value.slice(0, 200).map((item, index) => <ResultValue key={index} value={item} depth={depth + 1} />)}</Stack>;
  }
  return <Stack gap="md">{Object.entries(value).map(([key, item]) => <div key={key}><Text fw={600} size="sm" mb={4}>{label(key)}</Text><ResultValue value={item} depth={depth + 1} /></div>)}</Stack>;
}

export function ReadOnlyPage({ initialOperationId = "listarProductos" }: { initialOperationId?: string }) {
  const gateway = useContext(GatewayOriginContext);
  const mode = useContext(DataModeContext);
  const { session } = useAuthSession();
  const initialOperation = readOperations.find(item => item.id === initialOperationId)!;
  const [module, setModule] = useState(initialOperation.module);
  const [id, setId] = useState(initialOperationId);
  const [values, setValues] = useState<Record<string, string>>(() => defaults(initialOperationId));
  const [result, setResult] = useState<ReadResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState("");
  const pending = useRef<AbortController | null>(null);
  // The G7 session gates the UI; Azure's existing academic PUBLIC_READ_ONLY
  // policy authorizes these GETs. Never downgrade a rejected bearer to anonymous.
  const client = useMemo(() => gateway && session ? createReadOnlyClient(gateway, session, fetch, { publicReadOnly: true }) : null, [gateway, session]);
  const operations = readOperations.filter(item => item.module === module);
  const operation = readOperations.find(item => item.id === id)!;
  useEffect(() => () => pending.current?.abort(), []);
  function select(nextId: string) {
    pending.current?.abort(); pending.current = null;
    setId(nextId); setValues(defaults(nextId)); setResult(null); setError(""); setBusy(false); setUpdated("");
  }
  async function consult(event: FormEvent) {
    event.preventDefault();
    if (!client || mode !== "api") return;
    pending.current?.abort();
    const request = new AbortController(); pending.current = request;
    setBusy(true); setError("");
    try {
      const response = await client.read(id, values, request.signal);
      if (request.signal.aborted) return;
      setResult(response); setUpdated(new Date().toLocaleString("es-PE"));
    } catch (failure) {
      if (request.signal.aborted) return;
      setError(failure instanceof ReadFailure ? failure.message : "No se pudo conectar con el backend. Conserva los filtros y vuelve a consultar.");
    } finally { if (!request.signal.aborted) setBusy(false); }
  }
  function download() {
    if (result?.kind !== "file") return;
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a"); link.href = url; link.download = result.filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <Stack gap="lg">
    <PageHeader title="Consultas de los módulos" description="Consulta listados, detalles, estados y reportes disponibles en el modo de lectura del backend. Mantén tu sesión iniciada para acceder." />
    {(mode !== "api" || !client) && <FeedbackAlert semantic="warning" title="Conexión no disponible">Esta vista requiere el modo API, la conexión al backend y una sesión activa.</FeedbackAlert>}
    <Paper withBorder p="lg"><form onSubmit={event => void consult(event)}><Stack gap="md">
      <SimpleGrid cols={2}><Select label="Módulo" data={modules} value={module} allowDeselect={false} onChange={next => { if (next) { setModule(next); select(readOperations.find(item => item.module === next)!.id); } }} />
        <Select label="Consulta" searchable data={operations.map(item => ({ value: item.id, label: item.title }))} value={id} allowDeselect={false} onChange={next => { if (next) select(next); }} /></SimpleGrid>
      <SimpleGrid cols={3}>{operation.parameters.map(parameter => parameter.enum || parameter.type === "boolean"
        ? <Select key={parameter.name} label={label(parameter.name)} description={parameter.name === "canal" && requiresPublicReadChannel(id) ? "Elige el canal de venta para esta lectura comercial." : undefined} required={parameter.required || (parameter.name === "canal" && requiresPublicReadChannel(id))} clearable={!parameter.required} data={(parameter.enum ?? [true, false]).map(value => ({ value: String(value), label: typeof value === "boolean" ? value ? "Sí" : "No" : String(value) }))} value={values[parameter.name] || null} onChange={value => setValues(current => ({ ...current, [parameter.name]: value ?? "" }))} />
        : <TextInput key={parameter.name} label={label(parameter.name)} required={parameter.required} value={values[parameter.name] ?? ""} inputMode={parameter.type === "integer" || parameter.type === "number" ? "decimal" : undefined} onChange={event => { const value = event.currentTarget.value; setValues(current => ({ ...current, [parameter.name]: value })); }} />)}</SimpleGrid>
      <Text size="sm" c="dimmed">La primera consulta puede tardar hasta un minuto. Puedes cancelarla mientras esperas.</Text>
      <Group><Button type="submit" loading={busy} disabled={!client || mode !== "api"}>Consultar</Button>{busy && <Button variant="subtle" onClick={() => { pending.current?.abort(); setBusy(false); }}>Cancelar consulta</Button>}</Group>
    </Stack></form></Paper>
    {error && <FeedbackAlert semantic="error" title="No se pudo actualizar la consulta">{error}{result && " Se conserva el resultado anterior; no representa una actualización confirmada."}</FeedbackAlert>}
    {result && <Paper withBorder p="lg"><Stack gap="md"><Title order={2}>Resultado</Title><Text size="sm" c="dimmed">Última consulta confirmada: {updated}</Text>{result.kind === "data" ? <ResultValue value={result.value} /> : <Button variant="outline" onClick={download}>Guardar {result.filename}</Button>}</Stack></Paper>}
  </Stack>;
}
