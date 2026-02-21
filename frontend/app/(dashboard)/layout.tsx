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
        <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8 overflow-auto flex flex-col min-h-screen">
          <div className="flex-1">
            {children}
          </div>
          <div className="max-w-5xl mx-auto mt-8 w-full">
            <ActivitiesCarousel />
          </div>
        </main>
      </div>
    </div>
  );
}
