import { StationSectionPage } from "@/components/station-section-page";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export default async function ProductionPage({ params }: Context) {
  const user = await requireUser();
  return <StationSectionPage id={(await params).id} ownerId={user.id} section="production" />;
}
