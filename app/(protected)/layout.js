import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";

export default async function ProtectedLayout({ children }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  // Kasir dengan cabang nonaktif — paksa keluar
  if (session.user.branchActive === false) {
    redirect("/login?error=INACTIVE_BRANCH");
  }

  const { name, role, branchName } = session.user;

  return (
    <AppShell role={role} userName={name} branchName={branchName ?? null}>
      {children}
    </AppShell>
  );
}
