import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Button, Group, Stack, Text } from "@mantine/core";
import {
  EmptyState,
  FeedbackAlert,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "../../../components/shared";
import { AdministrationStateDialog } from "../components/AdministrationStateDialog";
import { CampaignScope } from "../components/CampaignScope";
import { useAdministrationRead } from "../hooks/useAdministrationRead";
import { administrationScenario } from "../services/administration";
import { campaignService } from "../services/campaignService";
import { promotionCatalogService } from "../services/catalogService";
import { channelChoices } from "../services/campaignRepository";
import { couponStatusLabel } from "../services/couponPresentation";
export function CampaignDetailPage({
  changeState = false,
}: {
  changeState?: boolean;
}) {
  const { promotionId = "" } = useParams();
  const [params, setParams] = useSearchParams(),
    scenario = administrationScenario(params),
    suffix = params.size ? `?${params}` : "";
  const [revision, setRevision] = useState(0),
    [opened, setOpened] = useState(false),
    [updated, setUpdated] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    location = useLocation(),
    navigate = useNavigate();
  const read = useCallback(
    (signal: AbortSignal) =>
      campaignService.read(promotionId, scenario, signal),
    [promotionId, scenario],
  );
  const state = useAdministrationRead(
    `${promotionId}:${scenario}:${revision}`,
    read,
  );
  const catalogRead = useCallback(
    (signal: AbortSignal) =>
      promotionCatalogService.products("default", signal),
    [],
  );
  const catalog = useAdministrationRead("catalog", catalogRead),
    record = state.status === "success" ? state.result : null;
  useEffect(() => {
    if (record && (location.state?.focusState || updated))
      trigger.current?.focus();
  }, [record, location.state, updated]);
  const close = () => {
    setOpened(false);
    if (changeState)
      navigate(`/promociones/${promotionId}${suffix}`, {
        replace: true,
        state: { focusState: true },
      });
  };
  return (
    <>
      <PageHeader
        title={record?.name ?? "Detalle de promoción"}
        actions={
          <Button
            component={Link}
            variant="outline"
            to={`/promociones${suffix}`}
          >
            Volver al listado
          </Button>
        }
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">
          Consulta y cambios locales de muestra; no se modifican compras reales.
        </FeedbackAlert>
        {location.state?.saved && (
          <FeedbackAlert semantic="success" title="Promoción guardada">
            La configuración fue confirmada en la sesión de demostración.
          </FeedbackAlert>
        )}
        {updated && (
          <FeedbackAlert semantic="success" title="Estado actualizado">
            El cambio fue confirmado. Los pedidos históricos no se modifican.
          </FeedbackAlert>
        )}
        {state.status === "loading" && (
          <Text role="status">Consultando promoción…</Text>
        )}
        {state.status === "error" && (
          <FeedbackAlert
            semantic="error"
            title="Consulta no disponible"
            actions={
              state.access ? undefined : (
                <Button
                  variant="outline"
                  onClick={() =>
                    setParams((current) => {
                      const next = new URLSearchParams(current);
                      next.delete("escenario");
                      return next;
                    })
                  }
                >
                  Volver a consultar
                </Button>
              )
            }
          >
            {state.message}
          </FeedbackAlert>
        )}
        {state.status === "success" && !record && (
          <EmptyState
            title="Promoción no encontrada"
            description="Selecciona otro registro en el listado."
          />
        )}
        {record && (
          <>
            <SectionCard
              title="Configuración comercial"
              actions={
                <StatusBadge>{couponStatusLabel(record.status)}</StatusBadge>
              }
            >
              <Text size="sm">
                Modalidad:{" "}
                {record.configuration.mode === "coupon"
                  ? "Con cupón"
                  : "Automática"}
              </Text>
              <Text size="sm">
                Beneficio: {record.configuration.benefit}
                {record.configuration.discountType === "percentage"
                  ? " %"
                  : " · Monto fijo (moneda no informada)"}
              </Text>
              <Text size="sm">Prioridad: {record.configuration.priority}</Text>
              <Text size="sm">
                Vigencia: {record.configuration.validFrom.replace("T", " ")} al{" "}
                {record.configuration.validUntil.replace("T", " ")} ·
                America/Lima
              </Text>
              <Text size="sm">
                Canales:{" "}
                {record.configuration.channels
                  .map(
                    (value) =>
                      channelChoices.find((item) => item.value === value)
                        ?.label ?? "No disponible",
                  )
                  .join(", ")}
              </Text>
            </SectionCard>
            <SectionCard title="Alcance de productos y SKU">
              <CampaignScope
                configuration={record.configuration}
                products={catalog.status === "success" ? catalog.result : []}
              />
            </SectionCard>
            <SectionCard title="Política de combinación">
              <Text size="sm">
                Ofertas de Pricing:{" "}
                {record.configuration.combination.pricing
                  ? "Permitida"
                  : "No combinable"}
              </Text>
              <Text size="sm">
                Promociones automáticas:{" "}
                {record.configuration.combination.automatic
                  ? "Permitida"
                  : "No combinable"}
              </Text>
              <Text size="sm">
                Cupones:{" "}
                {record.configuration.combination.coupon
                  ? "Permitida"
                  : "No combinable"}
              </Text>
              <Text size="sm">
                Cambiar o desactivar la promoción no modifica pedidos ya
                confirmados.
              </Text>
            </SectionCard>
            <Group gap="sm">
              <Button
                component={Link}
                to={`/promociones/${promotionId}/editar${suffix}`}
              >
                Editar promoción
              </Button>
              <Button
                ref={trigger}
                variant="outline"
                onClick={() => setOpened(true)}
              >
                {record.status === "active"
                  ? "Desactivar promoción"
                  : "Activar promoción"}
              </Button>
            </Group>
            <AdministrationStateDialog
              record={record}
              entityLabel="promoción"
              opened={opened || changeState}
              change={(status, signal) =>
                campaignService.changeStatus(
                  promotionId,
                  status,
                  scenario,
                  signal,
                )
              }
              read={(signal) =>
                campaignService.read(promotionId, "default", signal)
              }
              onCancel={close}
              onConfirmed={() => {
                close();
                setUpdated(true);
                setRevision((value) => value + 1);
              }}
            />
          </>
        )}
      </Stack>
    </>
  );
}
