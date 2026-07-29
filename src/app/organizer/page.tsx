import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import OrganizerAuthClient from "@/app/organizer/organizer-auth-client";
import {
  getAuthenticatedUserFromToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";

export default async function OrganizerPage() {
  const cookieStore = await cookies();
  const user = await getAuthenticatedUserFromToken(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );

  if (user) {
    redirect("/organizer/dashboard");
  }

  return <OrganizerAuthClient />;
}
