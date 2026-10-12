import { promotionServices } from "./promotionServices";
import type { CampaignRepository } from "./campaignRepository";
export const campaignService: CampaignRepository = promotionServices.campaigns;
