import { redirect } from "next/navigation";

/** The titles and instruments lists moved into Admin -> Configuration. */
export default function ProfileOptionsPage() {
  redirect("/admin/configuration#titles");
}
