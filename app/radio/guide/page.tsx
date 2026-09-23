import { redirect } from "next/navigation";
import { legacyRadioGuideHref, type GuideSearchParams } from "@/lib/guide-query";

type Context = { searchParams: Promise<GuideSearchParams> };

export default async function RadioGuidePage({ searchParams }: Context) {
  redirect(legacyRadioGuideHref(await searchParams));
}
