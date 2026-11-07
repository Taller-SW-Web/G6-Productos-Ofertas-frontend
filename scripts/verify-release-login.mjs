import { releasePolicy } from "./release-login-policy.mjs";
import { verifyReleaseLogin } from "./release-login-check.mjs";

// No HTTP/test exception is accepted by this production entry. Approvals come
// from owners independently of the preview URL and its public metadata.
try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--mfa-manual")) throw new Error("RELEASE_ARGUMENT_INVALID");
  const policy = releasePolicy({
    previewUrl: process.env.G6_RELEASE_PREVIEW_URL,
    approvedPreviewOrigin: process.env.G6_RELEASE_APPROVED_PREVIEW_ORIGIN,
    approvedG7ApiBase: process.env.G6_RELEASE_APPROVED_G7_API_BASE,
    approvedGatewayOrigin: process.env.G6_RELEASE_APPROVED_GATEWAY_ORIGIN,
    approvedGatewayOperation: process.env.G6_RELEASE_APPROVED_GATEWAY_OPERATION,
  });
  const result = await verifyReleaseLogin(policy, {
    email: process.env.G6_RELEASE_TEST_EMAIL,
    password: process.env.G6_RELEASE_TEST_PASSWORD,
    manualMfa: args[0] === "--mfa-manual",
    onMfaPending: () => console.log("MFA pendiente: el operador autorizado debe solicitar y escribir el código real en esta misma ventana. No se registra el código."),
  });
  console.log(result.mfaCompleted
    ? "PASS recorrido con MFA completado, denegación anónima y lectura con Bearer en listarCupones. Cierre local verificado y HTTP 204 de G7 observado. Revocación efectiva y homologación pendientes del acta bilateral."
    : "PASS recorrido con denegación anónima y lectura con Bearer en listarCupones. Cierre local verificado y HTTP 204 de G7 observado. MFA real, revocación efectiva y homologación pendientes del acta bilateral.");
} catch (error) {
  // Browser errors can contain form values or URLs: never print raw messages.
  const message = error instanceof Error ? error.message : "";
  if (message === "RELEASE_MFA_PENDING") {
    console.error("NO APTO PARA LIBERAR. Desafío MFA pendiente de intervención bilateral.");
  } else if (message === "RELEASE_LOGOUT_NOT_CONFIRMED") {
    console.error("NO APTO PARA LIBERAR. Cierre local verificado. HTTP 204 de G7 sin confirmar. Revocación pendiente de evidencia del owner.");
  } else if (message === "RELEASE_GATEWAY_OPERATION_NOT_APPROVED") {
    console.error("NO APTO PARA LIBERAR. Falta la aprobación de listarCupones acordada con los owners.");
  } else {
    console.error("NO APTO PARA LIBERAR. Configuración, destinos, redirecciones o recorrido sin verificar.");
  }
  process.exitCode = 1;
}
