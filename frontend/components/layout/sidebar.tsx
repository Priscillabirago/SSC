"use client";

import { GraduationCap, LineChart, ListCheck, MessageSquare, Settings, Timer } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: GraduationCap },
  { href: "/tasks", label: "Subjects & Tasks", icon: ListCheck },
  { href: "/schedule", label: "Scheduler", icon: Timer },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/coach", label: "AI Coach", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-64 flex-col bg-white/70 px-4 py-6 shadow-sm backdrop-blur md:flex">
      <Link href="/dashboard" className="mb-6 group">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Smart Study</p>
          <div className="h-0.5 w-12 bg-primary/60 rounded-full" />
          <p className="text-xl font-semibold text-foreground group-hover:text-primary/80 transition-colors">Companion</p>
        </div>
      </Link>
      <nav className="space-y-2">
        {links.map((link, index) => {
          const active = pathname?.startsWith(link.href);
          const Icon = link.icon;
          const isSettings = link.href === "/settings";
          return (
            <div key={link.href}>
              {isSettings && index > 0 && (
                <div className="my-2 h-px bg-border/40" />
              )}
              <Link
                href={link.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-primary text-primary-foreground shadow border-l-2 border-l-primary/20"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground hover:translate-x-0.5"
                )}
              >
                <Icon className="h-5 w-5" />
                {link.label}
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

