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
    <aside className="hidden w-64 flex-col bg-white/60 px-4 py-6 shadow-sm backdrop-blur lg:flex">
      <div className="mb-8 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-primary">Smart Study</p>
        <p className="text-xl font-semibold text-foreground">Companion</p>
      </div>
      <nav className="space-y-1">
        {links.map((link) => {
          const active = pathname?.startsWith(link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

