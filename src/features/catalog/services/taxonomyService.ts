import { mockTaxonomyRepository } from "../adapters/mockTaxonomyRepository";
import type { TaxonomyRepository } from "./taxonomyRepository";

export const taxonomyService: TaxonomyRepository = mockTaxonomyRepository;
