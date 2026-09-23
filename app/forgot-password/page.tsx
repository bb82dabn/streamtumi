import { Brand } from "@/components/brand";
import { PasswordResetForm } from "@/components/password-reset-form";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return <main className="auth-page"><section className="card auth-card"><Brand /><PasswordResetForm /></section></main>;
}
