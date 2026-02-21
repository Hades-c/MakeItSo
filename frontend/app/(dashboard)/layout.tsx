import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import Link from "next/link";
import {
  Briefcase,
  Compass,
  GraduationCap,
  LayoutDashboard,
  Map,
  Sparkles,
  User,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/explore", label: "Explore Courses", icon: Compass },
  { href: "/career", label: "Career Planner", icon: Briefcase },
  { href: "/roadmap", label: "My Roadmap", icon: Map },
  { href: "/courses", label: "Course Plan", icon: GraduationCap },
  { href: "/profile", label: "Profile", icon: User },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex bg-gray-50/50">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-[260px] border-r bg-white/80 backdrop-blur-sm">
        <div className="px-6 py-5 border-b">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-500/20">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">MakeItSo</span>
          </Link>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 py-4 flex-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-gray-100/80 transition-all duration-200"
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
              <span className="text-xs font-semibold text-violet-700">
                {session.user?.name?.charAt(0)?.toUpperCase() || "?"}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{session.user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{session.user?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="md:hidden border-b bg-white/80 backdrop-blur-sm px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold">MakeItSo</span>
          </Link>
          <nav className="flex gap-1">
            {navItems.slice(0, 5).map(({ href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Icon className="h-5 w-5" />
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex-1 p-4 md:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
