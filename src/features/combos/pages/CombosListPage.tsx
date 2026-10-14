import { useEffect, useState, useTransition } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ActionIcon,
  Button,
  Group,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconPlus, IconEye, IconEdit } from "@tabler/icons-react";
import { PageHeader } from "../../../components/shared/PageHeader";
import { SectionCard } from "../../../components/shared/SectionCard";
import { FeedbackAlert } from "../../../components/shared/FeedbackAlert";
import { EmptyState } from "../../../components/shared/EmptyState";
import { useCombosRepository } from "../hooks/useCombosRepository";
import { ComboStatusBadge, AvailabilityBadge } from "../components/ComboStatusBadge";
import type { ComboStatus, ComboSummaryItem } from "../types/combos";

export function CombosListPage() {
  const repository = useCombosRepository();
  const [searchParams, setSearchParams] = useSearchParams();

  const statusParam = (searchParams.get("estado") as ComboStatus | null) ?? "all";
  const pageParam = parseInt(searchParams.get("pagina") || "1", 10) || 1;

  const [items, setItems] = useState<ComboSummaryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const pageSize = 10;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await repository.listCombos(
          {
            status: statusParam === "all" ? undefined : statusParam,
            page: pageParam,
            pageSize,
          },
          controller.signal,
        );
        if (active) {
          setItems(result.items);
          setTotal(result.total);
        }
      } catch (err: unknown) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudieron cargar los combos comerciales.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [repository, statusParam, pageParam]);

  const handleStatusChange = (val: string | null) => {
    startTransition(() => {
      const nextParams = new URLSearchParams(searchParams);
      if (val && val !== "all") {
        nextParams.set("estado", val);
      } else {
        nextParams.delete("estado");
      }
      nextParams.set("pagina", "1");
      setSearchParams(nextParams);
    });
  };

  const handlePageChange = (page: number) => {
    startTransition(() => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("pagina", page.toString());
      setSearchParams(nextParams);
    });
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Gestión de combos"
        description="Administra ofertas comerciales agrupadas sin duplicar ownership de stock ni precios maestros."
        breadcrumbs={[
          { label: "Catálogo", to: "/productos" },
          { label: "Combos", to: "/combos" },
        ]}
        actions={
          <Button
            component={Link}
            to="/combos/nuevo"
            leftSection={<IconPlus size={16} />}
          >
            Crear combo
          </Button>
        }
      />

      {error && (
        <FeedbackAlert
          semantic="error"
          title="Error al consultar combos"
        >
          {error}
        </FeedbackAlert>
      )}

      <SectionCard title="Listado de combos">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Select
              label="Filtrar por estado administrativo"
              data={[
                { value: "all", label: "Todos los estados" },
                { value: "ACTIVO", label: "Activo" },
                { value: "INACTIVO", label: "Inactivo" },
              ]}
              value={statusParam}
              onChange={handleStatusChange}
              style={{ width: 240 }}
            />

            <Text size="sm" c="dimmed">
              {total} {total === 1 ? "combo registrado" : "combos registrados"}
            </Text>
          </Group>

          {loading ? (
            <Text size="sm" c="dimmed" p="md">
              Cargando combos...
            </Text>
          ) : items.length === 0 ? (
            <EmptyState
              title={
                statusParam !== "all"
                  ? "No se encontraron combos para el filtro seleccionado"
                  : "No hay combos registrados"
              }
              description={
                statusParam !== "all"
                  ? "Intenta seleccionando otro estado en el filtro superior."
                  : "Crea tu primer combo de productos con al menos dos SKUs vendibles directos."
              }
              action={
                statusParam === "all" ? (
                  <Button
                    component={Link}
                    to="/combos/nuevo"
                    leftSection={<IconPlus size={16} />}
                  >
                    Crear combo
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Table.ScrollContainer minWidth={800}>
                <Table verticalSpacing="sm" withTableBorder withColumnBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Combo</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Precio (PEN)</Table.Th>
                      <Table.Th style={{ textAlign: "center" }}>Componentes</Table.Th>
                      <Table.Th>Disponibilidad</Table.Th>
                      <Table.Th style={{ textAlign: "center" }}>Estado</Table.Th>
                      <Table.Th style={{ width: 120, textAlign: "center" }}>Acciones</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {items.map((combo) => (
                      <Table.Tr key={combo.comboId}>
                        <Table.Td>
                          <Text fw={600} size="sm">
                            <Link
                              to={`/combos/${combo.comboId}`}
                              style={{ textDecoration: "none", color: "inherit" }}
                            >
                              {combo.name}
                            </Link>
                          </Text>
                          <Text size="xs" c="dimmed" ff="monospace">
                            {combo.comboId}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text size="sm" fw={700}>
                            S/ {combo.price.toFixed(2)}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "center" }}>
                          <Text size="sm">
                            {combo.componentsCount} {combo.componentsCount === 1 ? "SKU" : "SKUs"}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <AvailabilityBadge
                            availability={combo.informativeAvailability}
                            freshness={combo.freshness}
                          />
                        </Table.Td>
                        <Table.Td style={{ textAlign: "center" }}>
                          <ComboStatusBadge status={combo.status} />
                        </Table.Td>
                        <Table.Td style={{ textAlign: "center" }}>
                          <Group gap="xs" justify="center">
                            <ActionIcon
                              component={Link}
                              to={`/combos/${combo.comboId}`}
                              variant="subtle"
                              color="gray"
                              title="Ver detalle del combo"
                              aria-label={`Ver detalle del combo ${combo.name}`}
                            >
                              <IconEye size={16} />
                            </ActionIcon>
                            <ActionIcon
                              component={Link}
                              to={`/combos/${combo.comboId}/editar`}
                              variant="subtle"
                              color="blue"
                              title="Editar combo"
                              aria-label={`Editar combo ${combo.name}`}
                            >
                              <IconEdit size={16} />
                            </ActionIcon>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>

              {totalPages > 1 && (
                <Group justify="center" mt="md">
                  <Pagination
                    total={totalPages}
                    value={pageParam}
                    onChange={handlePageChange}
                  />
                </Group>
              )}
            </>
          )}
        </Stack>
      </SectionCard>
    </Stack>
  );
}
