import { redirect } from "next/navigation";

export const metadata = { title: "Radio station management" };
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
export default async function RadioStationPage({ params }: Context) {
  const { id } = await params;
  redirect(`/stations/${id}`);
}
