"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { motion } from "framer-motion";
import {
  Briefcase,
  Compass,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Map,
  Sparkles,
  User,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/explore", label: "Explore Courses", icon: Compass },
  { href: "/career", label: "Career Paths", icon: Briefcase },
  { href: "/roadmap", label: "My Roadmap", icon: Map },
  { href: "/courses", label: "Course Plan", icon: GraduationCap },
  { href: "/profile", label: "Profile", icon: User },
];

interface DashboardSidebarProps {
  userName?: string | null;
  userEmail?: string | null;
}

export function DashboardSidebar({ userName, userEmail }: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[260px] border-r bg-white/80 backdrop-blur-sm fixed inset-y-0 left-0 z-30">
        <div className="px-6 py-5 border-b">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-red-800 flex items-center justify-center shadow-md shadow-red-800/20">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">MakeItSo</span>
          </Link>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 py-4 flex-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || (href === "/career" && pathname.startsWith("/career/"));
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "text-red-800 bg-red-50"
                    : "text-muted-foreground hover:text-foreground hover:bg-gray-100/80"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-lg bg-red-50 border border-red-100"
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                )}
                <Icon className={`h-[18px] w-[18px] relative z-10 ${isActive ? "text-red-800" : ""}`} />
                <span className="relative z-10">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t px-4 py-3">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-all duration-200 w-full"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Sign Out
          </button>
        </div>

        <div className="border-t px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-red-800 flex items-center justify-center shadow-sm">
              <span className="text-xs font-semibold text-white">
                {userName?.charAt(0)?.toUpperCase() || "?"}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top nav */}
      <header className="md:hidden border-b bg-white/80 backdrop-blur-sm px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-red-800 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-bold">MakeItSo</span>
        </Link>
        <nav className="flex gap-1">
          {navItems.map(({ href, icon: Icon }) => {
            const isActive = pathname === href || (href === "/career" && pathname.startsWith("/career/"));
            return (
              <Link
                key={href}
                href={href}
                className={`p-2 rounded-lg transition-colors ${
                  isActive
                    ? "text-red-800 bg-red-50"
                    : "text-muted-foreground hover:text-foreground hover:bg-gray-100"
                }`}
              >
                <Icon className="h-5 w-5" />
              </Link>
            );
          })}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="p-2 text-muted-foreground hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </nav>
      </header>
    </>
  );
}
