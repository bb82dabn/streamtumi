import { RadioListenExperience } from "@/components/radio-listen-experience";

export const metadata = { title: "Listen live", robots: { index: false, follow: false } };
type Context = { params: Promise<{ token: string }> };

export default async function ListenPage({ params }: Context) {
  const { token } = await params;
  return <RadioListenExperience token={token} />;
}
