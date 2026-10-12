import { readCouponMutationScenario } from "../dev/demoScenarios";
import { readCouponScenario } from "../dev/demoScenarios";
import { useEffect, useState } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Button, Skeleton, Stack, Text } from "@mantine/core";
import {
  EmptyState,
  FeedbackAlert,
  PageHeader,
} from "../../../components/shared";
import { CouponForm } from "../components/CouponForm";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import { useCoupon } from "../hooks/useCoupons";
import { useCouponForm } from "../hooks/useCouponForm";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { couponService } from "../services/couponService";

import type { CouponPromotion, CouponView } from "../services/couponRepository";

export function CouponFormPage() {
  const { couponId } = useParams();
  const [params] = useSearchParams();
  const state = useCoupon(couponId ?? "", readCouponScenario(params), 0);
  if (couponId && state.status === "loading")
    return (
      <Stack role="status">
        <Text>Cargando cupón…</Text>
        <Skeleton height={240} />
      </Stack>
    );
  if (couponId && state.status === "error")
    return (
      <Stack>
        <PageHeader title="Editar cupón" />
        <FeedbackAlert semantic="error" title="No se puede editar el cupón">
          {state.message}
        </FeedbackAlert>
        <Button component={Link} to="/cupones" variant="outline">
          Volver al listado
        </Button>
      </Stack>
    );
  const initial = couponId && state.status === "success" ? state.result : null;
  if (couponId && !initial)
    return (
      <EmptyState
        title="Cupón no encontrado"
        description="No hay un registro para editar."
        action={
          <Button component={Link} to="/cupones">
            Volver al listado
          </Button>
        }
      />
    );
  if (
    initial &&
    (initial.globalLimit === undefined ||
      initial.customerLimit === undefined ||
      initial.minimumAmount === undefined)
  )
    return (
      <FeedbackAlert semantic="warning" title="Configuración no disponible">
        Consulta la configuración completa antes de editar. No se sustituyen
        datos desconocidos por límites vacíos.
      </FeedbackAlert>
    );
  return <CouponFormContent key={couponId ?? "new"} initial={initial} />;
}

function CouponFormContent({ initial }: { initial: CouponView | null }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [choices, setChoices] = useState<CouponPromotion[] | null>(null);
  const [choiceError, setChoiceError] = useState(false);
  const [revision, setRevision] = useState(0);
  const suffix = params.size ? `?${params.toString()}` : "";
  const form = useCouponForm(initial, readCouponMutationScenario(params));
  const guard = useUnsavedChanges(
    form.dirty && !form.confirmed,
    form.submitting,
  );
  useEffect(() => {
    const controller = new AbortController();
    void couponService.promotions(controller.signal).then(
      (items) => {
        if (!controller.signal.aborted)
          setChoices(items.filter((item) => item.mode === "coupon"));
      },
      () => {
        if (!controller.signal.aborted) setChoiceError(true);
      },
    );
    return () => controller.abort();
  }, [revision]);
  const blocked =
    readCouponScenario(params) === "session" ||
    readCouponScenario(params) === "forbidden";
  const cancel = () =>
    navigate(initial ? `/cupones/${initial.id}${suffix}` : `/cupones${suffix}`);
  if (form.confirmed) {
    const next = new URLSearchParams(params);
    next.delete("escenario");
    return (
      <Navigate
        to={`/cupones/${form.confirmed.id}?${next.toString()}`}
        replace
        state={{ couponSaved: true }}
      />
    );
  }
  return (
    <>
      <PageHeader
        title={initial ? `Editar cupón — ${initial.code}` : "Crear cupón"}
        breadcrumbs={[
          { label: "Cupones de descuento", to: `/cupones${suffix}` },
          { label: initial ? "Editar cupón" : "Crear cupón" },
        ]}
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">
          Los cambios se guardan solo en esta sesión de demostración. Al
          recargar se recuperan los datos de muestra.
        </FeedbackAlert>
        {blocked ? (
          <FeedbackAlert semantic="warning" title="Acceso no disponible">
            No tienes acceso para guardar cupones. La información anterior se
            conserva.
          </FeedbackAlert>
        ) : choiceError ? (
          <FeedbackAlert
            semantic="error"
            title="Promociones no disponibles"
            actions={
              <Button
                variant="outline"
                onClick={() => {
                  setChoiceError(false);
                  setRevision((value) => value + 1);
                }}
              >
                Consultar promociones
              </Button>
            }
          >
            No se pudo consultar las promociones. No se puede guardar una
            asociación sin comprobar.
          </FeedbackAlert>
        ) : choices ? (
          <CouponForm
            form={form}
            promotions={choices}
            initial={initial}
            onCancel={cancel}
            onReload={() => navigate(`/cupones/${initial?.id ?? ""}${suffix}`)}
          />
        ) : (
          <Text role="status">Consultando promociones…</Text>
        )}
      </Stack>
      <UnsavedChangesDialog
        opened={guard.blocked}
        submitting={form.submitting}
        onStay={guard.stay}
        onDiscard={guard.discard}
      />
    </>
  );
}
