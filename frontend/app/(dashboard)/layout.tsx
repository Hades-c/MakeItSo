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
    <div className="min-h-screen flex bg-[#F8F9FB]">
      <DashboardSidebar
        userName={session.user?.name}
        userEmail={session.user?.email}
      />

      <div className="flex flex-col flex-1 min-w-0 md:ml-[240px]">
        {/* Bottom padding on phones clears the fixed bottom nav plus the
            device safe area; on desktop the nav is a sidebar. */}
        <main className="flex-1 p-4 md:p-8 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-14 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
