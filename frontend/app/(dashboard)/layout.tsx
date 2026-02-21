import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { ActivitiesCarousel } from "@/components/activities-carousel";

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
        <main className="flex-1 p-4 md:p-8 pb-20 md:pb-14 overflow-auto">
          {children}
        </main>
        {/* Fixed carousel bar at screen bottom */}
        <div className="fixed bottom-0 left-0 right-0 md:left-[240px] bg-[#F8F9FB] border-t border-gray-100 px-4 md:px-8 z-30">
          <div className="max-w-5xl mx-auto">
            <ActivitiesCarousel />
          </div>
        </div>
      </div>
    </div>
  );
}
