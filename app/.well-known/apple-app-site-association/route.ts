import { appleAppSiteAssociation, mobileAssociationResponse } from "@/lib/mobile-associations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return mobileAssociationResponse(appleAppSiteAssociation());
}
