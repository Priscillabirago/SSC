"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Info, LogOut, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  const hasSetEnergyToday = todayEnergy != null;

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
          <TooltipProvider>
            <div
              className={`flex items-center gap-1 sm:gap-2 rounded-full border bg-white px-2 sm:px-3 py-1 transition-colors ${
                hasSetEnergyToday ? "border-border/60" : "border-amber-300 bg-amber-50/50"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold uppercase text-muted-foreground hidden sm:inline">
                  {hasSetEnergyToday ? "Energy" : "Set today"}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      aria-label="How does energy affect my schedule?"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[260px]">
                    <p className="text-sm font-medium mb-1">How energy affects your schedule</p>
                    <p className="text-xs text-muted-foreground">
                      Lower energy → lighter sessions, fewer back-to-back blocks. Higher energy → more demanding work, longer focus blocks. Set this daily so the scheduler matches your capacity.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
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
          </TooltipProvider>
          <Badge variant="outline" className="hidden sm:inline-flex max-w-[160px] truncate">
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

