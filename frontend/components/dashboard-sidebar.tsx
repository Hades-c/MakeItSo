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
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/explore", label: "Courses", icon: Compass },
  { href: "/career", label: "Careers", icon: Briefcase },
  { href: "/roadmap", label: "Roadmap", icon: Map },
  { href: "/courses", label: "Plan", icon: GraduationCap },
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
      {/* Desktop sidebar — clean white */}
      <aside className="hidden md:flex flex-col w-[240px] bg-white border-r border-gray-100 fixed inset-y-0 left-0 z-30">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-50">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-sm">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-gray-900">MakeItSo</span>
              <span className="text-[10px] text-gray-400 block -mt-0.5">Davidson College</span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-0.5 px-3 py-3 flex-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || (href === "/career" && pathname.startsWith("/career/"));
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                  isActive
                    ? "text-rose-700 bg-rose-50"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-pill"
                    className="absolute inset-0 rounded-lg bg-rose-50"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <Icon className={`h-4 w-4 relative z-10 ${isActive ? "text-rose-600" : ""}`} />
                <span className="relative z-10">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User + sign out */}
        <div className="border-t border-gray-50 p-3">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {userName?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-900 truncate">{userName}</p>
              <p className="text-[10px] text-gray-400 truncate">{userEmail}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-lg border-t border-gray-100 px-2 py-1 flex justify-around safe-area-pb">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || (href === "/career" && pathname.startsWith("/career/"));
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                isActive ? "text-rose-600" : "text-gray-400"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
