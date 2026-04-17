import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";

export default async function ProtectedLayout({ children }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const { name, role, branchName } = session.user;

  return (
    <AppShell role={role} userName={name} branchName={branchName ?? null}>
      {children}
    </AppShell>
  );
}
