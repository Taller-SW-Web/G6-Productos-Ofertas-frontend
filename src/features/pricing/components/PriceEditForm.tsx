import {
  Button,
  Group,
  NumberInput,
  Radio,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { Link } from "react-router-dom";
import {
  ConfirmDialog,
  FeedbackAlert,
  SectionCard,
} from "../../../components/shared";
import { tokens } from "../../../theme/tokens";
import { usePriceEdit } from "../hooks/usePriceEdit";
import type {
  EditablePrice,
  PriceDraft,
  ReviewScenario,
  WriteTarget,
} from "../services/pricingModels";
import { PriceSummary } from "./PriceSummary";
import { UnsavedPriceGuard } from "./UnsavedPriceGuard";
import { useUnsavedPriceNavigation } from "../hooks/useUnsavedPriceNavigation";

export function PriceEditForm({
  target,
  initial,
  scenario,
  back,
}: {
  target: WriteTarget;
  initial: EditablePrice;
  scenario: ReviewScenario;
  back: string;
}) {
  const edit = usePriceEdit(target, initial, scenario);
  const locked = edit.mutation.busy || edit.refresh.busy || edit.finished;
  const blocker = useUnsavedPriceNavigation(
    edit.dirty,
    edit.mutation.busy || edit.refresh.busy,
  );
  function change<K extends keyof PriceDraft>(field: K, value: PriceDraft[K]) {
    edit.change({ ...edit.draft, [field]: value });
  }
  function focusError(form: HTMLFormElement) {
    requestAnimationFrame(() =>
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
    );
  }
  const failure = edit.mutation.error;
  return (
    <>
      <UnsavedPriceGuard
        blocker={blocker}
        busy={edit.mutation.busy || edit.refresh.busy}
      />
      <PriceSummary price={edit.mutation.result?.view ?? edit.readPrice.view} />
      {edit.mutation.result && (
        <FeedbackAlert
          semantic="success"
          title="Precio actualizado — simulación local"
        >
          La respuesta mock confirmó la versión{" "}
          {edit.mutation.result.view.version}.{" "}
          <Link to={back}>Consultar el precio vigente</Link>.
        </FeedbackAlert>
      )}
      <div style={{ maxWidth: tokens.layout.form }}>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (edit.validate()) edit.setReviewing(true);
            else focusError(event.currentTarget);
          }}
        >
          <SectionCard
            title="Propuesta de nuevos valores"
            description={`Objetivo fijo: ${target.targetId === "base" ? "precio del producto; lo heredan variantes sin override" : "precio específico del SKU seleccionado"}. Versión leída: ${edit.readPrice.view.version}.`}
          >
            <Text size="sm">
              * Campo obligatorio. Canal de escritura:{" "}
              {target.channel === "retail" ? "Retail" : "Global"}.
            </Text>
            <SimpleGrid cols={2} spacing="lg">
              <NumberInput
                label="Nuevo precio regular"
                required
                value={edit.draft.regular}
                onValueChange={(value, source) => {
                  if (source.source === "event") change("regular", value.value);
                }}
                hideControls
                disabled={locked}
                error={edit.errors.regular}
              />
              <TextInput
                label="Moneda"
                required
                value={edit.draft.currency}
                onChange={(event) =>
                  change("currency", event.currentTarget.value)
                }
                disabled={locked}
                error={edit.errors.currency}
              />
            </SimpleGrid>
            <Radio.Group
              wrapperProps={{
                role: "group",
                "aria-label": "Revisar acción para la oferta",
                "aria-invalid":
                  edit.errors.offer && edit.draft.offerAction !== "ESTABLECER"
                    ? true
                    : undefined,
                tabIndex: -1,
              }}
              label="Acción para la oferta"
              value={edit.draft.offerAction}
              onChange={(value) => {
                if (
                  value === "CONSERVAR" ||
                  value === "ESTABLECER" ||
                  value === "ELIMINAR"
                )
                  change("offerAction", value);
              }}
              error={
                edit.draft.offerAction === "ESTABLECER"
                  ? undefined
                  : edit.errors.offer
              }
            >
              <Group mt="sm" gap="md">
                <Radio
                  value="CONSERVAR"
                  label="Conservar oferta"
                  disabled={locked}
                />
                <Radio
                  value="ESTABLECER"
                  label="Establecer oferta"
                  disabled={locked}
                />
                <Radio
                  value="ELIMINAR"
                  label="Retirar oferta"
                  disabled={locked}
                />
              </Group>
            </Radio.Group>
            {edit.draft.offerAction === "ESTABLECER" && (
              <NumberInput
                label="Nuevo importe de oferta"
                required
                value={edit.draft.offer}
                onValueChange={(value, source) => {
                  if (source.source === "event") change("offer", value.value);
                }}
                hideControls
                disabled={locked}
                error={edit.errors.offer}
              />
            )}
            <Text size="sm">
              El importe escrito se conserva al cambiar de acción; solo se usa
              al establecer oferta. Retirar representa ausencia de oferta.
            </Text>
            <Textarea
              label="Motivo del cambio"
              required
              value={edit.draft.reason}
              onChange={(event) => change("reason", event.currentTarget.value)}
              disabled={locked}
              error={edit.errors.reason}
            />
            {failure && (
              <FeedbackAlert
                semantic={failure.kind === "unknown" ? "warning" : "error"}
                title={
                  failure.kind === "conflict"
                    ? "El precio cambió desde tu consulta"
                    : failure.kind === "unknown"
                      ? "Resultado desconocido"
                      : "No se aplicó la propuesta"
                }
              >
                {failure.message}
              </FeedbackAlert>
            )}
            {(failure?.kind === "conflict" || failure?.kind === "unknown") && (
              <Button
                variant="outline"
                loading={edit.refresh.busy}
                style={{ alignSelf: "flex-start" }}
                onClick={() => void edit.reread()}
              >
                Releer precio
              </Button>
            )}
            {edit.refresh.error && (
              <FeedbackAlert semantic="error" title="No se pudo releer">
                {edit.refresh.error.message}
              </FeedbackAlert>
            )}
            {edit.current && (
              <SectionCard title="Comparar lectura y propuesta">
                <SimpleGrid cols={3} spacing="lg">
                  <Text size="sm">
                    Leído: v{edit.readPrice.view.version} ·{" "}
                    {edit.readPrice.regular} {edit.readPrice.currency} · Oferta:{" "}
                    {edit.readPrice.offer ?? "Sin oferta"}
                  </Text>
                  <Text size="sm">
                    Actual: v{edit.current.view.version} ·{" "}
                    {edit.current.regular} {edit.current.currency} · Oferta:{" "}
                    {edit.current.offer ?? "Sin oferta"}
                  </Text>
                  <Text size="sm">
                    Propuesta: {edit.draft.regular} {edit.draft.currency} ·{" "}
                    {edit.draft.offerAction === "ESTABLECER"
                      ? edit.draft.offer
                      : edit.draft.offerAction === "ELIMINAR"
                        ? "Sin oferta"
                        : "Conservar oferta actual"}
                  </Text>
                </SimpleGrid>
                {failure?.kind === "unknown" ? (
                  <Text size="sm">
                    Esta lectura no confirma la autoría del cambio. El reenvío
                    permanece bloqueado; cancela y revisa el resultado antes de
                    una nueva intención.
                  </Text>
                ) : (
                  <Button variant="outline" onClick={edit.acceptReview}>
                    Revisé el precio actual; conservar propuesta
                  </Button>
                )}
              </SectionCard>
            )}
            <Group justify="flex-end" gap="sm">
              <Button
                component={Link}
                to={back}
                variant="outline"
                style={{ alignSelf: "flex-start" }}
                disabled={edit.mutation.busy}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  locked ||
                  failure?.kind === "unknown" ||
                  (failure?.kind === "conflict" && !edit.resolved)
                }
              >
                Guardar cambios
              </Button>
            </Group>
            {failure?.kind === "conflict" && !edit.resolved && (
              <Text size="sm">
                Para guardar debes releer y revisar explícitamente la nueva
                versión.
              </Text>
            )}
          </SectionCard>
        </form>
      </div>
      <ConfirmDialog
        opened={edit.reviewing && blocker.state !== "blocked"}
        title="Confirmar cambio de precio"
        confirmLabel="Confirmar cambio local"
        submitting={edit.mutation.busy}
        onCancel={() => edit.setReviewing(false)}
        onConfirm={() => void edit.save()}
      >
        <Stack gap="md">
          <Text size="sm">
            {edit.readPrice.view.name} ·{" "}
            {target.targetId === "base"
              ? "Producto; afecta a las variantes que heredan"
              : "Override del SKU"}{" "}
            · {target.channel === "retail" ? "Retail" : "Global"} · Versión{" "}
            {edit.readPrice.view.version}.
          </Text>
          <Text size="sm">
            Regular: {edit.readPrice.regular} → {edit.draft.regular}{" "}
            {edit.draft.currency}. Oferta:{" "}
            {edit.draft.offerAction === "ESTABLECER"
              ? edit.draft.offer
              : edit.draft.offerAction === "ELIMINAR"
                ? "Sin oferta"
                : `Conservar ${edit.readPrice.offer ?? "Sin oferta"}`}
            .
          </Text>
          <Text size="sm">
            Motivo: {edit.draft.reason}. Se simulará un cambio local sin
            publicación ni persistencia comercial.
          </Text>
        </Stack>
      </ConfirmDialog>
    </>
  );
}
