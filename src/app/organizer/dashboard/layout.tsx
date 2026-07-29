import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  getAuthenticatedUserFromToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";

export default async function OrganizerDashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const user = await getAuthenticatedUserFromToken(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );

  if (!user) {
    redirect("/organizer?reason=auth");
  }

  return children;
}
