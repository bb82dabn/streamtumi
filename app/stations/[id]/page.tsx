import { StationSectionPage } from "@/components/station-section-page";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export default async function StationPage({ params }: Context) {
  const user = await requireUser();
  const { id } = await params;
  return <StationSectionPage id={id} ownerId={user.id} section="overview" />;
}
