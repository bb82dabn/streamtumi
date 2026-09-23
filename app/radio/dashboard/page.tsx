import { redirect } from "next/navigation";

export const metadata = { title: "Radio dashboard", robots: { index: false, follow: false } };

export default function RadioDashboardPage() {
  redirect("/dashboard?type=radio");
}
