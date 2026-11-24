import { expect, test } from "@playwright/test";

for (const status of [401, 403, 503]) {
  test(`INT08-${status}: muestra el error del contrato y no rellena el listado`, async ({ page }) => {
    await page.route("https://gateway.test/api/v1/**", route => route.fulfill({
      status,
      contentType: "application/problem+json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ code: status === 401 ? "TOKEN_INVALIDO" : status === 403 ? "SCOPE_INSUFICIENTE" : "SERVICIO_NO_DISPONIBLE" }),
    }));
    await page.goto("/tests/harness/catalog-http.html?path=/productos");
    await expect(page.getByRole("heading", { name: "Gestión de productos" })).toBeVisible();
    await expect(page.getByText(new RegExp(`${status},`)).first()).toBeVisible();
    await expect(page.getByText("Camiseta Running Endurance", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText: "CAM-RUN" })).toHaveCount(0);
  });
}

test('INT08-AUTH-01: sin sesión, las rutas administrativas redirigen a login', async ({ page }) => {
  await page.goto('/tests/harness/catalog-auth.html?path=%2Fproductos&session=none');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gestión de productos', exact: true })).toHaveCount(0);
});

test('INT08-AUTH-02: un rol sin permiso ve 403 de UI y no consulta Catalog', async ({ page }) => {
  let catalogRequests = 0;
  await page.route('https://gateway.test/api/v1/**', async route => {
    catalogRequests += 1;
    await route.fulfill({ status: 403, contentType: 'application/problem+json', json: { status: 403, code: 'SCOPE_INSUFICIENTE' } });
  });
  await page.goto('/tests/harness/catalog-auth.html?path=%2Fproductos&session=wrong-role');
  await expect(page.getByRole('heading', { name: 'Acceso denegado', exact: true })).toBeVisible();
  await expect(page.getByText(/no tiene el rol GESTOR_COMERCIAL/i)).toBeVisible();
  expect(catalogRequests).toBe(0);
});

test('INT08-AUTH-03: JWT sintético vencido recibe 401, limpia el listado y cierra sesión', async ({ page }) => {
  let catalogReads = 0;
  await page.route('https://gateway.test/api/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/categorias/administracion') || url.pathname.endsWith('/marcas/administracion') || url.pathname.endsWith('/tipos-producto'))
      return route.fulfill({ status: 200, contentType: 'application/json', json: { items: [], meta: { pagina: 1, tamanio: 100, total: 0, totalPaginas: 0 } } });
    if (url.pathname.endsWith('/productos/administracion')) {
      catalogReads += 1;
      if (catalogReads === 1) return route.fulfill({ status: 200, contentType: 'application/json', json: { items: [{ productId: 'h5-expired-product', nombre: 'Producto previo H5', skuBase: 'H5-OLD', categoriaId: 'cat-h5', marcaId: 'brand-h5', tipoProductoId: 'type-h5', tieneVariantes: false, estado: 'ACTIVO', catalogVersion: 1 }], meta: { pagina: 1, tamanio: 10, total: 1, totalPaginas: 1 } } });
      return route.fulfill({ status: 401, contentType: 'application/problem+json', json: { status: 401, code: 'TOKEN_INVALIDO' } });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', json: { items: [], meta: { pagina: 1, tamanio: 100, total: 0, totalPaginas: 0 } } });
  });
  await page.goto('/tests/harness/catalog-auth.html?path=%2Fproductos&session=expired');
  await expect(page.getByRole('link', { name: 'Ver detalle de Producto previo H5' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Búsqueda' }).fill('H5-OLD');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await expect(page.getByText('Producto previo H5', { exact: true })).toHaveCount(0);
  expect(catalogReads).toBe(2);
});

test('INT08-DATA-01: rechaza DTO malformado sin sustituirlo por fixtures', async ({ page }) => {
  await page.route('https://gateway.test/api/v1/**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ items: [{}], meta: { pagina: 1, tamanio: 10, total: 1, totalPaginas: 1 } }),
  }));
  await page.goto('/tests/harness/catalog-http.html?path=/productos');
  await expect(page.getByRole('heading', { name: 'Error al consultar productos' })).toBeVisible();
  await expect(page.getByText('Camiseta Running Endurance', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'CAM-RUN' })).toHaveCount(0);
});

test('INT08-TIMEOUT-01: un timeout HTTP abortado termina en error recuperable', async ({ page }) => {
  await page.route('https://gateway.test/api/v1/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 15_500));
    try { await route.fulfill({ status: 200, contentType: 'application/json', json: { items: [], meta: { pagina: 1, tamanio: 10, total: 0, totalPaginas: 0 } } }); } catch { /* The adapter aborts its bounded request at 15 seconds. */ }
  });
  await page.goto('/tests/harness/catalog-http.html?path=/productos');
  await expect(page.getByText('No se pudo consultar el servicio. Intente consultar nuevamente.')).toBeVisible({ timeout: 19_000 });
  await expect(page.getByRole('row').filter({ hasText: 'CAM-RUN' })).toHaveCount(0);
});

test('INT08-RETRY-01: una respuesta 503 puede recuperarse con el reintento explícito del usuario', async ({ page }) => {
  let catalogReads = 0;
  await page.route('https://gateway.test/api/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/productos/administracion')) {
      catalogReads += 1;
      if (catalogReads === 1) return route.fulfill({ status: 503, contentType: 'application/problem+json', json: { status: 503, code: 'SERVICIO_NO_DISPONIBLE' } });
      return route.fulfill({ status: 200, contentType: 'application/json', json: { items: [{ productId: 'h5-recovered-product', nombre: 'Producto recuperado H5', skuBase: 'H5-RECOVERED', categoriaId: 'cat-h5', marcaId: 'brand-h5', tipoProductoId: 'type-h5', tieneVariantes: false, estado: 'ACTIVO', catalogVersion: 1 }], meta: { pagina: 1, tamanio: 10, total: 1, totalPaginas: 1 } } });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', json: { items: [], meta: { pagina: 1, tamanio: 100, total: 0, totalPaginas: 0 } } });
  });
  await page.goto('/tests/harness/catalog-http.html?path=/productos');
  await expect(page.getByText(/503, SERVICIO_NO_DISPONIBLE/)).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar consulta', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Ver detalle de Producto recuperado H5' })).toBeVisible();
  expect(catalogReads).toBe(2);
});

test('INT08-RECOVERY-01: la carga parcial muestra Taxonomy indisponible y recupera sus filtros', async ({ page }) => {
  let categoryReads = 0;
  await page.route('https://gateway.test/api/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/categorias/administracion')) {
      categoryReads += 1;
      if (categoryReads === 1) return route.fulfill({ status: 503, contentType: 'application/problem+json', json: { status: 503, code: 'SERVICIO_NO_DISPONIBLE' } });
      return route.fulfill({ status: 200, contentType: 'application/json', json: { items: [{ categoriaId: 'cat-h5', nombre: 'Categoría recuperada H5', estado: 'ACTIVO' }], meta: { pagina: 1, tamanio: 200, total: 1, totalPaginas: 1 } } });
    }
    if (url.pathname.endsWith('/productos/administracion')) return route.fulfill({ status: 200, contentType: 'application/json', json: { items: [{ productId: 'h5-partial-product', nombre: 'Producto parcial H5', skuBase: 'H5-PARTIAL', categoriaId: 'cat-h5', marcaId: 'brand-h5', tipoProductoId: 'type-h5', tieneVariantes: false, estado: 'ACTIVO', catalogVersion: 1 }], meta: { pagina: 1, tamanio: 10, total: 1, totalPaginas: 1 } } });
    return route.fulfill({ status: 200, contentType: 'application/json', json: { items: [], meta: { pagina: 1, tamanio: 200, total: 0, totalPaginas: 0 } } });
  });
  await page.goto('/tests/harness/catalog-http.html?path=/productos');
  await expect(page.getByRole('link', { name: 'Ver detalle de Producto parcial H5' })).toBeVisible();
  await expect(page.getByText('Categorías no disponibles', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar filtros', exact: true }).click();
  await expect(page.getByText('Categorías no disponibles', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Categoría', exact: true })).toHaveValue('Categoría recuperada H5');
  expect(categoryReads).toBe(2);
});

test('INT08-REFRESH-01: refresh conserva identidades y no duplica productos', async ({ page }) => {
  let catalogReads = 0;
  await page.route('https://gateway.test/api/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/productos/administracion')) {
      catalogReads += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', json: { items: [{ productId: 'h5-refresh-product', nombre: 'Producto estable H5', skuBase: 'H5-STABLE', categoriaId: 'cat-h5', marcaId: 'brand-h5', tipoProductoId: 'type-h5', tieneVariantes: false, estado: 'ACTIVO', catalogVersion: 2 }], meta: { pagina: 1, tamanio: 10, total: 1, totalPaginas: 1 } } });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', json: { items: [], meta: { pagina: 1, tamanio: 200, total: 0, totalPaginas: 0 } } });
  });
  await page.goto('/tests/harness/catalog-http.html?path=/productos');
  await expect(page.getByRole('link', { name: 'Ver detalle de Producto estable H5' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Búsqueda' }).fill('H5-STABLE');
  await expect(page.getByRole('link', { name: 'Ver detalle de Producto estable H5' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'H5-STABLE' })).toHaveCount(1);
  expect(catalogReads).toBe(2);
});
