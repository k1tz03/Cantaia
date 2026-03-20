import { redirect } from "next/navigation";

export default function DirectionPage() {
  redirect("/dashboard?view=org");
}
