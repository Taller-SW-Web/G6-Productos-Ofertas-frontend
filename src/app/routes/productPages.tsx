import { lazy } from "react";
export const CurrentPricePage = lazy(() =>
  import("../../features/pricing/pages/CurrentPricePage").then((module) => ({
    default: module.CurrentPricePage,
  })),
);
export const CategoryTreePage = lazy(() =>
  import("../../features/taxonomy/pages/CategoryTreePage").then((module) => ({
    default: module.CategoryTreePage,
  })),
);
export const CreateCategoryPage = lazy(() =>
  import("../../features/taxonomy/pages/CreateCategoryPage").then((module) => ({
    default: module.CreateCategoryPage,
  })),
);
export const EditCategoryPage = lazy(() =>
  import("../../features/taxonomy/pages/EditCategoryPage").then((module) => ({
    default: module.EditCategoryPage,
  })),
);
export const CategoryDetailPage = lazy(() =>
  import("../../features/taxonomy/pages/CategoryDetailPage").then((module) => ({
    default: module.CategoryDetailPage,
  })),
);
export const DeactivateCategoryPage = lazy(() =>
  import("../../features/taxonomy/pages/DeactivateCategoryPage").then((module) => ({
    default: module.DeactivateCategoryPage,
  })),
);
export const CharacteristicListPage = lazy(() =>
  import("../../features/taxonomy/pages/CharacteristicListPage").then(
    (module) => ({
      default: module.CharacteristicListPage,
    }),
  ),
);
export const CharacteristicCreatePage = lazy(() =>
  import("../../features/taxonomy/pages/CharacteristicCreatePage").then(
    (module) => ({
      default: module.CharacteristicCreatePage,
    }),
  ),
);
export const CharacteristicEditPage = lazy(() =>
  import("../../features/taxonomy/pages/CharacteristicEditPage").then(
    (module) => ({
      default: module.CharacteristicEditPage,
    }),
  ),
);
export const CharacteristicDetailPage = lazy(() =>
  import("../../features/taxonomy/pages/CharacteristicDetailPage").then(
    (module) => ({
      default: module.CharacteristicDetailPage,
    }),
  ),
);
export const CharacteristicValuesPage = lazy(() =>
  import("../../features/taxonomy/pages/CharacteristicValuesPage").then(
    (module) => ({
      default: module.CharacteristicValuesPage,
    }),
  ),
);
export const CharacteristicStatePage = lazy(() =>
  import("../../features/taxonomy/pages/CharacteristicStatePage").then(
    (module) => ({
      default: module.CharacteristicStatePage,
    }),
  ),
);
export const ProductTypeListPage = lazy(() =>
  import("../../features/taxonomy/pages/ProductTypeListPage").then((module) => ({
    default: module.ProductTypeListPage,
  })),
);
export const ProductTypeCreatePage = lazy(() =>
  import("../../features/taxonomy/pages/ProductTypeCreatePage").then((module) => ({
    default: module.ProductTypeCreatePage,
  })),
);
export const ProductTypeDetailPage = lazy(() =>
  import("../../features/taxonomy/pages/ProductTypeDetailPage").then((module) => ({
    default: module.ProductTypeDetailPage,
  })),
);
export const ProductTypeAssociatePage = lazy(() =>
  import("../../features/taxonomy/pages/ProductTypeAssociatePage").then((module) => ({
    default: module.ProductTypeAssociatePage,
  })),
);
