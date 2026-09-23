import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { PasswordChangeForm } from "@/components/password-change-form";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "Change temporary password" };
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/dashboard");
  return <main className="auth-page"><section className="card auth-card"><Brand /><PasswordChangeForm /></section></main>;
}
