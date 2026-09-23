import { redirect } from "next/navigation";

export const metadata = { title: "Change temporary password", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function RadioChangePasswordPage() {
  redirect("/account/change-password");
}
