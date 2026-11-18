import { releasePolicy } from "../release-login-policy.mjs";
import { verifyReleaseLogin } from "../release-login-check.mjs";

// Test-only entry. No real credential env is read, and every URL must be HTTP
// loopback. Production verify-release-login.mjs cannot enable this exception.
const policy = releasePolicy({
  previewUrl: process.env.G6_ISOLATED_PREVIEW_URL,
  approvedPreviewOrigin: process.env.G6_ISOLATED_PREVIEW_URL,
  approvedG7ApiBase: process.env.G6_ISOLATED_G7_API_BASE,
  approvedGatewayOrigin: process.env.G6_ISOLATED_GATEWAY_ORIGIN,
}, { isolatedFixture: true });
await verifyReleaseLogin(policy, { email: "a@example.test", password: "isolated-fixture-password" });
console.log("PASS gate contractual aislado HTTP loopback; NO aceptación bilateral real.");
