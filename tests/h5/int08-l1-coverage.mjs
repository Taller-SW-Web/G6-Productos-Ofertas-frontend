const scenarios = Object.freeze([
  {
    id: "INT08-L1-ANONYMOUS-ADMIN",
    requires: [
      "G6_H5_INT08_ISOLATED_HARNESS",
      "CATALOG_REAL_BROWSER_ORIGIN",
      "CATALOG_REAL_GATEWAY_ORIGIN",
    ],
  },
  {
    id: "INT08-L1-DENIED-SCOPE",
    requires: [
      "G6_H5_INT08_ISOLATED_HARNESS",
      "CATALOG_REAL_BROWSER_ORIGIN",
      "CATALOG_REAL_GATEWAY_ORIGIN",
      "CATALOG_REAL_FORBIDDEN_JWT",
    ],
  },
  {
    id: "INT08-L1-AUTHORIZED-ADMIN-READ",
    requires: [
      "G6_H5_INT08_ISOLATED_HARNESS",
      "CATALOG_REAL_BROWSER_ORIGIN",
      "CATALOG_REAL_GATEWAY_ORIGIN",
      "CATALOG_REAL_JWT",
    ],
  },
  {
    id: "INT08-L1-ABSENT-PRODUCT-404",
    requires: [
      "G6_H5_INT08_ISOLATED_HARNESS",
      "CATALOG_REAL_BROWSER_ORIGIN",
      "CATALOG_REAL_GATEWAY_ORIGIN",
      "CATALOG_REAL_JWT",
    ],
  },
]);

function validLoopbackOrigin(value) {
  try {
    const url = new URL(value ?? "");
    return (
      url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      Number(url.port) >= 1024
    );
  } catch {
    return false;
  }
}

export function preflightInt08L1(env = process.env) {
  return scenarios.map((scenario) => {
    const blockers = scenario.requires.filter((key) => {
      if (key === "G6_H5_INT08_ISOLATED_HARNESS") return env[key] !== "1";
      if (
        key === "CATALOG_REAL_BROWSER_ORIGIN" ||
        key === "CATALOG_REAL_GATEWAY_ORIGIN"
      )
        return !validLoopbackOrigin(env[key]);
      return !env[key];
    });
    return {
      ...scenario,
      status: blockers.length ? "BLOCKED_DEPENDENCY" : "READY_B",
      blockers,
    };
  });
}
