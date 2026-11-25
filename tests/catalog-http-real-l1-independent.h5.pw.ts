import { expect, test } from "@playwright/test";
import { preflightInt08L1 } from "./h5/int08-l1-coverage.mjs";

const readiness = new Map(
  preflightInt08L1(process.env).map((item) => [item.id, item]),
);

async function catalogStatus(
  page: import("@playwright/test").Page,
  path: string,
  token?: string,
) {
  await page.goto("/tests/harness/catalog-http-real.html?path=/productos");
  return page.evaluate(
    async ({ origin, route, bearer, correlation }) => {
      const response = await fetch(new URL(route, origin), {
        headers: {
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          "X-Correlation-Id": correlation,
        },
        credentials: "omit",
      });
      return response.status;
    },
    {
      origin: process.env.CATALOG_REAL_BROWSER_ORIGIN!,
      route: `/api/v1${path}`,
      bearer: token ?? null,
      correlation:
        process.env.CATALOG_REAL_CORRELATION_ID ??
        "00000000-0000-4000-8000-000000000050",
    },
  );
}

test("INT08-L1-ANONYMOUS-ADMIN: identidad ausente recibe 401 o 403", async ({
  page,
}) => {
  test.skip(
    readiness.get("INT08-L1-ANONYMOUS-ADMIN")?.status !== "READY_B",
    "CASE_PREREQUISITES_MISSING",
  );
  expect([401, 403]).toContain(
    await catalogStatus(page, "/productos/administracion"),
  );
});

test("INT08-L1-DENIED-SCOPE: identidad sin permiso recibe 403", async ({
  page,
}) => {
  test.skip(
    readiness.get("INT08-L1-DENIED-SCOPE")?.status !== "READY_B",
    "CASE_PREREQUISITES_MISSING",
  );
  expect(
    await catalogStatus(
      page,
      "/productos/administracion",
      process.env.CATALOG_REAL_FORBIDDEN_JWT,
    ),
  ).toBe(403);
});

test("INT08-L1-AUTHORIZED-ADMIN-READ: identidad autorizada lee Catalog", async ({
  page,
}) => {
  test.skip(
    readiness.get("INT08-L1-AUTHORIZED-ADMIN-READ")?.status !== "READY_B",
    "CASE_PREREQUISITES_MISSING",
  );
  expect(
    await catalogStatus(
      page,
      "/productos/administracion",
      process.env.CATALOG_REAL_JWT,
    ),
  ).toBe(200);
});

test("INT08-L1-ABSENT-PRODUCT-404: Catalog conserva el oráculo de recurso ausente", async ({
  page,
}) => {
  test.skip(
    readiness.get("INT08-L1-ABSENT-PRODUCT-404")?.status !== "READY_B",
    "CASE_PREREQUISITES_MISSING",
  );
  expect(
    await catalogStatus(
      page,
      "/productos/administracion/ffffffff-ffff-4fff-8fff-ffffffffffff",
      process.env.CATALOG_REAL_JWT,
    ),
  ).toBe(404);
});
