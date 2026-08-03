import { redirect } from "next/navigation";

/** Friendly alias → Application Hub */
export default function HubIndexPage() {
  redirect("/master-admin");
}
