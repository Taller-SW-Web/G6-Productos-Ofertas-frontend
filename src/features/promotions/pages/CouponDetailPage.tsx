import { readCouponMutationScenario } from "../dev/demoScenarios";
import { readCouponScenario } from "../dev/demoScenarios";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Button, Group, Skeleton, Stack, Text } from "@mantine/core";
import {
  EmptyState,
  FeedbackAlert,
  PageHeader,
} from "../../../components/shared";
import { CouponSummary } from "../components/CouponSummary";
import { CouponStateDialog } from "../components/CouponStateDialog";
import { useCoupon } from "../hooks/useCoupons";

export function CouponDetailPage({
  limitsOnly = false,
  changeState = false,
}: {
  limitsOnly?: boolean;
  changeState?: boolean;
}) {
  const { couponId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const [dialogOpened, setDialogOpened] = useState(false);
  const [stateUpdated, setStateUpdated] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const state = useCoupon(couponId, readCouponScenario(params), revision);
  const coupon = state.status === "success" ? state.result : null;
  const suffix = params.size ? `?${params.toString()}` : "";
  useEffect(() => {
    if (coupon && (location.state?.focusState || stateUpdated))
      trigger.current?.focus();
  }, [coupon, location.state, stateUpdated]);
  const closeState = () => {
    setDialogOpened(false);
    if (changeState)
      navigate(`/cupones/${couponId}${suffix}`, {
        replace: true,
        state: { focusState: true },
      });
  };
  const back = (
    <Button
      component={Link}
      variant="outline"
      to={limitsOnly ? `/cupones/${couponId}${suffix}` : `/cupones${suffix}`}
    >
      {limitsOnly ? "Volver al detalle" : "Volver al listado"}
    </Button>
  );
  const retry = () => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("escenario");
        return next;
      },
      { replace: true },
    );
    setRevision((value) => value + 1);
  };
  return (
    <>
      <PageHeader
        title={
          coupon
            ? `${limitsOnly ? "Límites y uso" : "Cupón"} — ${coupon.code}`
            : limitsOnly
              ? "Límites y uso"
              : "Detalle de cupón"
        }
        breadcrumbs={[
          { label: "Promociones" },
          { label: "Cupones de descuento", to: `/cupones${suffix}` },
          {
            label: coupon?.code ?? "Detalle",
            to: limitsOnly ? `/cupones/${couponId}${suffix}` : undefined,
          },
          ...(limitsOnly ? [{ label: "Límites y uso" }] : []),
        ]}
        actions={back}
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">
          Los cupones y sus usos son simulados. Esta consulta no accede a
          información comercial real.
        </FeedbackAlert>
        {location.state?.couponSaved && (
          <FeedbackAlert semantic="success" title="Cupón guardado">
            La propuesta quedó guardada en la sesión de demostración.
          </FeedbackAlert>
        )}
        {stateUpdated && (
          <FeedbackAlert semantic="success" title="Estado actualizado">
            El nuevo estado fue confirmado en la sesión de demostración. Los
            usos registrados se conservan.
          </FeedbackAlert>
        )}
        {state.status === "loading" && (
          <Stack role="status" aria-label="Cargando cupón">
            <Text size="sm">Cargando cupón…</Text>
            <Skeleton height={180} />
            <Skeleton height={180} />
          </Stack>
        )}
        {state.status === "error" && (
          <FeedbackAlert
            semantic={state.kind === "unavailable" ? "error" : "warning"}
            title={
              state.kind === "session"
                ? "Verifica tu sesión"
                : state.kind === "forbidden"
                  ? "Acceso no disponible"
                  : "No se pudo consultar el cupón"
            }
            actions={
              state.kind === "unavailable" ? (
                <Button variant="outline" onClick={retry}>
                  Volver a consultar
                </Button>
              ) : undefined
            }
          >
            {state.message}
          </FeedbackAlert>
        )}
        {state.status === "success" && !coupon && (
          <EmptyState
            title="Cupón no encontrado"
            description="El cupón solicitado no está disponible. Vuelve al listado para seleccionar otro."
          />
        )}
        {coupon && (
          <>
            <CouponSummary coupon={coupon} limitsOnly={limitsOnly} />
            {!limitsOnly && (
              <Group gap="sm">
                <Button
                  component={Link}
                  variant="outline"
                  to={`/cupones/${couponId}/limites${suffix}`}
                >
                  Ver límites y uso
                </Button>
                <Button
                  component={Link}
                  to={`/cupones/${couponId}/editar${suffix}`}
                >
                  Editar cupón
                </Button>
                <Button
                  ref={trigger}
                  variant="outline"
                  onClick={() => {
                    setStateUpdated(false);
                    setDialogOpened(true);
                  }}
                >
                  {coupon.status === "active"
                    ? "Desactivar cupón"
                    : "Activar cupón"}
                </Button>
              </Group>
            )}
            <CouponStateDialog
              key={coupon.id}
              coupon={coupon}
              scenario={readCouponMutationScenario(params)}
              opened={dialogOpened || changeState}
              onCancel={closeState}
              onConfirmed={() => {
                setRevision((value) => value + 1);
                setStateUpdated(true);
                closeState();
              }}
            />
          </>
        )}
      </Stack>
    </>
  );
}
