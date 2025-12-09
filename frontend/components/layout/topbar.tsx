"use client";

import { format } from "date-fns";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProfile } from "@/features/profile/hooks";
import { useLogout } from "@/features/auth/hooks";
import { useTodayEnergy, useUpsertEnergy } from "@/features/energy/hooks";
import { toast } from "@/components/ui/use-toast";

const energyOptions: { label: string; value: "low" | "medium" | "high" }[] = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" }
];

export function Topbar() {
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
    <header className="flex w-full items-center justify-between border-b border-border/60 bg-white/70 px-4 py-4 backdrop-blur">
      <div>
        <p className="text-sm text-muted-foreground">Today • {format(new Date(), "EEEE, MMM d")}</p>
        <h1 className="text-2xl font-semibold text-foreground">
          {profile?.full_name ? `Welcome back, ${profile.full_name.split(" ")[0]}!` : "Welcome!"}
        </h1>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 rounded-full border border-border/60 bg-white px-3 py-1">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Energy</span>
          {energyOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleEnergyClick(option.value)}
              className={`rounded-full px-2 py-1 text-xs font-medium transition ${
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
        <Button variant="ghost" size="icon" onClick={logout}>
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}

