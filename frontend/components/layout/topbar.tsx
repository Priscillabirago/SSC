"use client";

import { useState } from "react";
import { format } from "date-fns";
import { LogOut, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProfile } from "@/features/profile/hooks";
import { useLogout } from "@/features/auth/hooks";
import { useTodayEnergy, useUpsertEnergy } from "@/features/energy/hooks";
import { toast } from "@/components/ui/use-toast";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";

const energyOptions: { label: string; value: "low" | "medium" | "high" }[] = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" }
];

export function Topbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: profile } = useProfile();
  const logout = useLogout();
  const { data: todayEnergy } = useTodayEnergy();
  const upsertEnergy = useUpsertEnergy();

  const energyLevel = todayEnergy?.level ?? "medium";

  const handleEnergyClick = (level: "low" | "medium" | "high") => {
    const today = format(new Date(), "yyyy-MM-dd");
    upsertEnergy.mutate(
      { day: today, level },
      {
        onSuccess: () => {
          toast({
            title: "Energy updated",
            description: `We'll plan with ${level} energy in mind.`
          });
        }
      }
    );
  };

  return (
    <>
      <header className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 bg-white/70 px-4 py-3 sm:py-4 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
            className="h-8 w-8 md:hidden flex-shrink-0"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm text-muted-foreground truncate">Today • {format(new Date(), "EEEE, MMM d")}</p>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground truncate">
              {profile?.full_name ? `Welcome back, ${profile.full_name.split(" ")[0] || profile.full_name}!` : "Welcome!"}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <div className="flex items-center gap-1 sm:gap-2 rounded-full border border-border/60 bg-white px-2 sm:px-3 py-1">
            <span className="text-xs font-semibold uppercase text-muted-foreground hidden sm:inline">Energy</span>
            {energyOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleEnergyClick(option.value)}
                className={`rounded-full px-1.5 sm:px-2 py-1 text-xs font-medium transition ${
                  energyLevel === option.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary/70"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Badge variant="outline" className="hidden sm:inline-flex">
            {profile?.timezone ?? "UTC"}
          </Badge>
          <Button variant="ghost" size="icon" onClick={logout} className="h-8 w-8 sm:h-10 sm:w-10">
            <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        </div>
      </header>
      <MobileSidebar open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
    </>
  );
}

