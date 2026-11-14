import { useCallback } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Anchor,
  Badge,
  Button,
  Container,
  Group,
  Image,
  Paper,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  EntityTable,
  FeedbackAlert,
  PageHeader,
  type TableColumn,
} from "../../../components/shared";
import {
  demoCatalogApi,
  type DemoCategory,
  type DemoChannel,
  type DemoProduct,
} from "../adapters/demoCatalogApi";
import { useDemoRead } from "../hooks/useDemoRead";

const money = (value: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    value,
  );
const channels: { value: DemoChannel; label: string }[] = [
  { value: "MARKETPLACE", label: "Marketplace" },
  { value: "CHATBOT", label: "Chatbot" },
  { value: "RETAIL", label: "Retail" },
];
function readChannel(value: string | null): DemoChannel | null {
  return channels.some((channel) => channel.value === value)
    ? (value as DemoChannel)
    : null;
}
function Price({ id }: { id: string }) {
  const load = useCallback(
    (signal: AbortSignal) => demoCatalogApi.price(id, signal),
    [id],
  );
  const state = useDemoRead(load);
  if (state.status === "loading")
    return <Skeleton width={90} height={20} aria-label="Cargando precio" />;
  if (state.status === "error")
    return (
      <Text role="alert" size="sm" title={state.message}>
        Precio no disponible
      </Text>
    );
  return (
    <Stack gap={0} data-testid="real-price">
      <Text fw={600}>{money(state.data.offer ?? state.data.regular)}</Text>
      {state.data.offer !== null && (
        <Text size="xs" td="line-through">
          {money(state.data.regular)}
        </Text>
      )}
    </Stack>
  );
}
function Photo({
  product,
  large = false,
}: {
  product: DemoProduct;
  large?: boolean;
}) {
  return product.images[0] ? (
    <Image
      src={product.images[0]}
      alt={product.name}
      w={large ? 320 : 72}
      h={large ? 300 : 72}
      fit="contain"
    />
  ) : (
    <Text size="sm">Sin imagen registrada</Text>
  );
}
function categoryName(categories: DemoCategory[], id: string) {
  return (
    categories.find((category) => category.id === id)?.name ??
    "Categoría no encontrada"
  );
}

function Products() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const page = Math.max(1, Number(params.get("pagina")) || 1);
  const q = params.get("q") ?? "";
  const categoryId = params.get("categoriaId") ?? "";
  const channel = readChannel(params.get("canal"));
  const load = useCallback(
    async (signal: AbortSignal) => {
      const categoriesPromise = demoCatalogApi.categories(signal);
      const productsPromise = channel
        ? demoCatalogApi.list({ page, q, categoryId, channel }, signal)
        : Promise.resolve(null);
      const [products, categories] = await Promise.all([
        productsPromise,
        categoriesPromise,
      ]);
      return { products, categories };
    },
    [page, q, categoryId, channel],
  );
  const state = useDemoRead(load);
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "pagina") next.delete("pagina");
    setParams(next);
  };
  const categories = state.status === "success" ? state.data.categories : [];
  const columns: TableColumn<DemoProduct>[] = [
    {
      key: "image",
      header: "Imagen",
      width: 110,
      render: (row) => <Photo product={row} />,
    },
    {
      key: "name",
      header: "Producto",
      width: 280,
      render: (row) => (
        <Anchor
          c="var(--po-primaryHover)"
          component={Link}
          to={`/demo/g6/productos/${encodeURIComponent(row.id)}?canal=${encodeURIComponent(channel!)}`}
          state={{ from: location.pathname + location.search }}
        >
          {row.name}
        </Anchor>
      ),
    },
    {
      key: "sku",
      header: "SKU base",
      width: 230,
      render: (row) => (
        <Text size="sm" ff="monospace">
          {row.sku ?? "Sin SKU base"}
        </Text>
      ),
    },
    {
      key: "category",
      header: "Categoría",
      width: 180,
      render: (row) => categoryName(categories, row.categoryId),
    },
    {
      key: "price",
      header: "Precio base (PEN)",
      width: 190,
      align: "right",
      render: (row) => <Price id={row.id} />,
    },
  ];
  return (
    <Stack>
      <PageHeader
        title="Productos"
        description="Consulta productos visibles comercialmente. Elige el canal para cargar el catálogo correspondiente."
      />
      <Group align="end">
        <Select
          label="Canal comercial"
          placeholder="Selecciona un canal"
          data={channels}
          value={channel}
          onChange={(value) => change("canal", value ?? "")}
        />
        <TextInput
          label="Buscar productos"
          value={q}
          onChange={(event) => change("q", event.currentTarget.value)}
        />
        <Select
          label="Categoría"
          clearable
          data={categories.map((category) => ({
            value: category.id,
            label: category.name,
          }))}
          value={categoryId || null}
          onChange={(value) => change("categoriaId", value ?? "")}
        />
        <Button variant="outline" component={Link} to="/demo/g6/categorias">
          Consultar categorías
        </Button>
      </Group>
      <EntityTable
        caption="Productos de G6"
        columns={columns}
        rows={
          state.status === "success" && state.data.products
            ? state.data.products.items
            : []
        }
        rowKey={(row) => row.id}
        state={
          state.status === "error"
            ? state
            : state.status === "loading"
              ? state
              : { status: "success" }
        }
        empty={{
          title: channel ? "Sin productos" : "Selecciona un canal",
          description: channel
            ? "No hay productos visibles para este canal y estos filtros."
            : "Elige Marketplace, Chatbot o Retail para consultar productos visibles.",
        }}
        pagination={
          state.status === "success" && state.data.products
            ? {
                page: state.data.products.page,
                pageSize: state.data.products.pageSize,
                total: state.data.products.total,
                onChange: (value) => change("pagina", String(value)),
              }
            : undefined
        }
      />
    </Stack>
  );
}

function Detail() {
  const { id = "" } = useParams();
  const location = useLocation();
  const [params] = useSearchParams();
  const channel = readChannel(params.get("canal"));
  const from: unknown = location.state?.from;
  const back =
    typeof from === "string" && from.startsWith("/demo/g6/productos?")
      ? from
      : "/demo/g6/productos" +
        (channel ? `?canal=${encodeURIComponent(channel)}` : "");
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!channel) return null;
      const [product, categories] = await Promise.all([
        demoCatalogApi.detail(id, channel, signal),
        demoCatalogApi.categories(signal),
      ]);
      return { product, categories };
    },
    [id, channel],
  );
  const state = useDemoRead(load);
  if (!channel)
    return (
      <Stack>
        <FeedbackAlert semantic="info" title="Selecciona un canal comercial">
          El detalle requiere el canal elegido para consultar el producto.
        </FeedbackAlert>
        <Button component={Link} to="/demo/g6/productos" variant="outline">
          Elegir canal
        </Button>
      </Stack>
    );
  if (state.status === "loading")
    return <Text role="status">Cargando producto…</Text>;
  if (state.status === "error")
    return (
      <Stack>
        <Button component={Link} to={back} variant="outline">
          Volver a productos
        </Button>
        <FeedbackAlert semantic="error" title="No se pudo cargar el producto">
          {state.message}
        </FeedbackAlert>
      </Stack>
    );
  if (!state.data) return null;
  const { product, categories } = state.data;
  return (
    <Stack>
      <Button component={Link} to={back} variant="outline" w="fit-content">
        Volver a productos
      </Button>
      <PageHeader
        title={product.name}
        description={product.sku ?? "Sin SKU base"}
      />
      <Paper p="xl">
        <SimpleGrid cols={2}>
          <Photo product={product} large />
          <Stack>
            <Title order={2}>Detalle del producto</Title>
            <Text>{product.description || "Sin descripción registrada"}</Text>
            <Text>
              Categoría: {categoryName(categories, product.categoryId)}
            </Text>
            <Text>SKU base: {product.sku ?? "Sin SKU base"}</Text>
            <Text fw={600}>Precio base en PEN</Text>
            <Price id={product.id} />
          </Stack>
        </SimpleGrid>
      </Paper>
    </Stack>
  );
}
function Categories() {
  const [params] = useSearchParams();
  const channel = readChannel(params.get("canal"));
  const load = useCallback(
    (signal: AbortSignal) => demoCatalogApi.categories(signal),
    [],
  );
  const state = useDemoRead(load);
  const rows = state.status === "success" ? state.data : [];
  return (
    <Stack>
      <PageHeader
        title="Categorías"
        description="Categorías consultadas en Taxonomy."
      />
      <EntityTable
        caption="Categorías de G6"
        columns={[
          {
            key: "name",
            header: "Categoría",
            render: (row) => (
              <Anchor
                c="var(--po-primaryHover)"
                component={Link}
                to={`/demo/g6/productos?${channel ? `canal=${encodeURIComponent(channel)}&` : ""}categoriaId=${encodeURIComponent(row.id)}`}
              >
                {row.name}
              </Anchor>
            ),
          },
          {
            key: "parent",
            header: "Categoría padre",
            render: (row) =>
              row.parentId
                ? categoryName(rows, row.parentId)
                : "Categoría raíz",
          },
        ]}
        rows={rows}
        rowKey={(row) => row.id}
        state={
          state.status === "error"
            ? state
            : state.status === "loading"
              ? state
              : { status: "success" }
        }
        empty={{
          title: "Sin categorías",
          description: "Taxonomy no devolvió categorías.",
        }}
      />
    </Stack>
  );
}
export function G6ReadDemoApp() {
  const location = useLocation();
  const selectedChannel = readChannel(new URLSearchParams(location.search).get("canal"));
  const categoriesHref =
    "/demo/g6/categorias" +
    (selectedChannel ? `?canal=${encodeURIComponent(selectedChannel)}` : "");
  return (
    <>
      <Container size="xl" py="xl">
        <Stack gap="xl">
          <Group justify="space-between">
            <Title order={1}>G6 · Productos y Ofertas</Title>
            <Badge variant="outline" color="gray">
              Solo lectura
            </Badge>
          </Group>
          <Group component="nav" aria-label="Navegación de consulta">
            <Anchor c="var(--po-primaryHover)" component={Link} to={
              "/demo/g6/productos" +
              (selectedChannel ? `?canal=${encodeURIComponent(selectedChannel)}` : "")
            }>
              Productos
            </Anchor>
            <Anchor
              c="var(--po-primaryHover)"
              component={Link}
              to={categoriesHref}
            >
              Categorías
            </Anchor>
          </Group>
          <Routes>
            <Route path="productos" element={<Products />} />
            <Route path="productos/:id" element={<Detail />} />
            <Route path="categorias" element={<Categories />} />
            <Route path="*" element={<Navigate to="/demo/g6/productos" replace />} />
          </Routes>
        </Stack>
      </Container>
    </>
  );
}
