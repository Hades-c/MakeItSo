import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import Link from "next/link";
import { BookOpen, LayoutDashboard, GraduationCap, Briefcase, User } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/courses", label: "Courses", icon: GraduationCap },
  { href: "/career", label: "Career", icon: Briefcase },
  { href: "/profile", label: "Profile", icon: User },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-white px-4 py-6">
        <Link href="/dashboard" className="flex items-center gap-2 text-primary font-bold text-xl mb-8 px-2">
          <BookOpen className="h-6 w-6" />
          MakeItSo
        </Link>
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t pt-4 px-2">
          <p className="text-xs text-muted-foreground truncate">{session.user?.name}</p>
          <p className="text-xs text-muted-foreground truncate">{session.user?.email}</p>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="md:hidden border-b bg-white px-4 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-primary font-bold">
            <BookOpen className="h-5 w-5" />
            MakeItSo
          </Link>
          <nav className="flex gap-3">
            {navItems.map(({ href, icon: Icon }) => (
              <Link key={href} href={href} className="text-muted-foreground hover:text-foreground">
                <Icon className="h-5 w-5" />
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex-1 p-6 bg-gray-50">{children}</main>
      </div>
    </div>
  );
}
