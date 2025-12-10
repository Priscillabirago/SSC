"use client";

import { GraduationCap, LineChart, ListCheck, MessageSquare, Settings, Timer, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: GraduationCap },
  { href: "/tasks", label: "Subjects & Tasks", icon: ListCheck },
  { href: "/schedule", label: "Scheduler", icon: Timer },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/coach", label: "AI Coach", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings }
];

interface MobileSidebarProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function MobileSidebar({ open, onOpenChange }: Readonly<MobileSidebarProps>) {
  const pathname = usePathname();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed left-0 top-0 h-full w-[280px] max-w-[85vw] translate-x-0 translate-y-0 rounded-none rounded-r-2xl border-r p-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left [&>button]:hidden">
        <div className="flex h-full flex-col bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-4">
            <Link href="/dashboard" onClick={() => onOpenChange(false)} className="group">
              <div className="space-y-1.5">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Smart Study</p>
                <div className="h-0.5 w-12 bg-primary/60 rounded-full" />
                <p className="text-xl font-semibold text-foreground group-hover:text-primary/80 transition-colors">Companion</p>
              </div>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-6">
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
                    onClick={() => onOpenChange(false)}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
