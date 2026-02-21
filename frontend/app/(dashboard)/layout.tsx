import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex bg-[hsl(220,20%,97%)]">
      <DashboardSidebar
        userName={session.user?.name}
        userEmail={session.user?.email}
      />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 md:ml-[260px]">
        <main className="flex-1 p-4 md:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
