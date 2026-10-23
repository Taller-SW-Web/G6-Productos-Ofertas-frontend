import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/oswald/latin-700.css";
import { theme, cssVariablesResolver } from "./theme/theme";
import "./theme/global.css";
import { App } from "./app/App";
import { createPricingRuntime } from "./features/pricing/services/pricingService";
import { PricingProvider } from "./features/pricing/components/PricingProvider";
import { resolveDataMode } from "./app/config/dataMode";
import { DataModeContext } from "./app/config/DataModeContext";
import { PromotionApiContext } from "./app/config/PromotionApiContext";
import { PromotionSessionContext } from "./app/config/PromotionSessionContext";

const root = createRoot(document.getElementById("root")!);
async function start() {
  const mode = resolveDataMode(
    import.meta.env.VITE_DATA_MODE,
    import.meta.env.DEV,
  );
  const runtime = await createPricingRuntime(mode);
  const gatewayOrigin = import.meta.env.VITE_GATEWAY_ORIGIN as
    string | undefined;
  const securityApiBase = import.meta.env.VITE_G7_API_BASE as
    string | undefined;
  if (mode === "api" && !!gatewayOrigin !== !!securityApiBase)
    throw new Error(
      "Configura las URLs de Gateway y Seguridad para iniciar sesión.",
    );
  const promotions =
    mode === "api" && gatewayOrigin && securityApiBase
      ? (
          await import("./features/promotions/services/promotionSessionRuntime")
        ).createPromotionSessionRuntime(gatewayOrigin, securityApiBase)
      : null;
  root.render(
    <StrictMode>
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
        forceColorScheme="light"
      >
        <DataModeContext.Provider value={mode}>
          <PricingProvider runtime={runtime}>
            <PromotionSessionContext.Provider
              value={promotions?.session ?? null}
            >
              <PromotionApiContext.Provider
                value={promotions?.services ?? null}
              >
                <App />
              </PromotionApiContext.Provider>
            </PromotionSessionContext.Provider>
          </PricingProvider>
        </DataModeContext.Provider>
      </MantineProvider>
    </StrictMode>,
  );
}
void start().catch((error: unknown) =>
  root.render(
    <div role="alert">
      {error instanceof Error
        ? error.message
        : "No se pudo iniciar la aplicación."}
    </div>,
  ),
);
