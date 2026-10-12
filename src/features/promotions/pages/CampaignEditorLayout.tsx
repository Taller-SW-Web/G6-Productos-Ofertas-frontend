import { administrationScenario } from "../dev/demoScenarios";
import { reviewServices, reviewCreationAccess } from "../dev/reviewServices";
import { useCallback } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Button, Skeleton, Stack, Text } from "@mantine/core";
import { EmptyState, FeedbackAlert } from "../../../components/shared";
import { useAdministrationRead } from "../hooks/useAdministrationRead";
import { useAdministrationEditor } from "../hooks/useAdministrationEditor";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";

import { campaignService } from "../services/campaignService";
import {
  campaignErrors,
  normalizeCampaignDraft,
} from "../services/campaignValidation";
import {
  emptyCampaign,
  type CampaignDraft,
  type CampaignView,
} from "../services/campaignRepository";
import type { CatalogProductChoice } from "../services/catalogRepository";
const draftOf = (record: CampaignView) => structuredClone(record.configuration);
export interface CampaignEditorContext {
  form: ReturnType<typeof useAdministrationEditor<CampaignView, CampaignDraft>>;
  initial: CampaignView | null;
  root: string;
  suffix: string;
  products: CatalogProductChoice[];
  catalogLoading: boolean;
  catalogError: string | undefined;
}
export function CampaignEditorLayout() {
  const { promotionId } = useParams();
  const [params] = useSearchParams();
  const scenario = administrationScenario(params);
  const read = useCallback(
    (signal: AbortSignal) =>
      promotionId
        ? reviewServices(scenario).campaigns.read(promotionId, signal)
        : reviewCreationAccess(scenario, signal).then(() => null),
    [promotionId, scenario],
  );
  const state = useAdministrationRead(
    JSON.stringify([promotionId, scenario]),
    read,
  );
  if (state.status === "loading")
    return (
      <Stack role="status">
        <Text>Cargando promoción…</Text>
        <Skeleton height={200} />
      </Stack>
    );
  if (state.status === "error")
    return (
      <Stack>
        <FeedbackAlert semantic="error" title="No se puede editar">
          {state.message}
        </FeedbackAlert>
        <Button component={Link} to="/promociones" variant="outline">
          Volver al listado
        </Button>
      </Stack>
    );
  if (promotionId && !state.result)
    return (
      <EmptyState
        title="Promoción no encontrada"
        description="Selecciona otro registro para editar."
        action={
          <Button component={Link} to="/promociones">
            Volver al listado
          </Button>
        }
      />
    );
  return (
    <CampaignEditorProvider key={promotionId ?? "new"} initial={state.result} />
  );
}
function CampaignEditorProvider({ initial }: { initial: CampaignView | null }) {
  const [params] = useSearchParams();
  const scenario = administrationScenario(params),
    suffix = params.size ? `?${params}` : "";
  const root = initial
    ? `/promociones/${initial.id}/editar`
    : "/promociones/nueva";
  const form = useAdministrationEditor(
    initial,
    emptyCampaign,
    draftOf,
    campaignErrors,
    reviewServices(scenario).campaigns,
    normalizeCampaignDraft,
    campaignService,
  );
  const guard = useUnsavedChanges(
    form.dirty && !form.confirmed,
    form.submitting,
    root,
  );
  const readProducts = useCallback(
    (signal: AbortSignal) => reviewServices(scenario).catalog.products(signal),
    [scenario],
  );
  const catalog = useAdministrationRead(`catalog:${scenario}`, readProducts);
  if (form.confirmed) {
    const next = new URLSearchParams(params);
    next.delete("escenario");
    return (
      <Navigate
        replace
        to={`/promociones/${form.confirmed.id}?${next}`}
        state={{ saved: true }}
      />
    );
  }
  const context: CampaignEditorContext = {
    form,
    initial,
    root,
    suffix,
    products: catalog.status === "success" ? catalog.result : [],
    catalogLoading: catalog.status === "loading",
    catalogError: catalog.status === "error" ? catalog.message : undefined,
  };
  return (
    <>
      <Outlet context={context} />
      <UnsavedChangesDialog
        opened={guard.blocked}
        submitting={form.submitting}
        onStay={guard.stay}
        onDiscard={guard.discard}
      />
    </>
  );
}
