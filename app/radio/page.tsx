import { redirect } from "next/navigation";

export default function RadioHome() {
  redirect("/guide?type=radio");
}
