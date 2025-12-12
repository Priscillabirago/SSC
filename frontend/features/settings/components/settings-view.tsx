"use client";

import { useEffect, useState } from "react";
import { Plus, X, Clock, Mail, Lock, KeyRound, Play } from "lucide-react";
import { useDemoMode } from "@/contexts/demo-mode-context";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useTodayEnergy, useEnergyLogs } from "@/features/energy/hooks";
import { useProfile, useUpdateProfile } from "@/features/profile/hooks";
import { toast } from "@/components/ui/use-toast";
import { StudyWindow, StudyWindowConfig, CustomTimeRange, UserProfile } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { changePassword, resetPassword, changeEmail } from "@/features/auth/api";

const timezones = [
  "UTC",
  // Americas
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Buenos_Aires",
  // Europe
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Athens",
  "Europe/Moscow",
  // Asia
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Asia/Manila",
  "Asia/Jakarta",
  // Oceania
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "Pacific/Auckland",
  // Africa
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
];

const studyWindows: StudyWindow[] = ["morning", "afternoon", "evening", "night"];

// Helper to get friendly timezone label
function getTimezoneLabel(tz: string): string {
  const labels: Record<string, string> = {
    "UTC": "UTC (Coordinated Universal Time)",
    // Americas
    "America/New_York": "Eastern Time (ET)",
    "America/Chicago": "Central Time (CT)",
    "America/Denver": "Mountain Time (MT)",
    "America/Los_Angeles": "Pacific Time (PT)",
    "America/Phoenix": "Mountain Time - Arizona (MST)",
    "America/Anchorage": "Alaska Time (AKT)",
    "America/Toronto": "Eastern Time - Toronto (ET)",
    "America/Vancouver": "Pacific Time - Vancouver (PT)",
    "America/Mexico_City": "Central Time - Mexico (CST)",
    "America/Sao_Paulo": "Brasília Time (BRT)",
    "America/Buenos_Aires": "Argentina Time (ART)",
    // Europe
    "Europe/London": "London (GMT/BST)",
    "Europe/Paris": "Central European Time (CET)",
    "Europe/Berlin": "Central European Time - Berlin (CET)",
    "Europe/Rome": "Central European Time - Rome (CET)",
    "Europe/Madrid": "Central European Time - Madrid (CET)",
    "Europe/Amsterdam": "Central European Time - Amsterdam (CET)",
    "Europe/Stockholm": "Central European Time - Stockholm (CET)",
    "Europe/Zurich": "Central European Time - Zurich (CET)",
    "Europe/Vienna": "Central European Time - Vienna (CET)",
    "Europe/Dublin": "Dublin (GMT/IST)",
    "Europe/Lisbon": "Western European Time - Lisbon (WET)",
    "Europe/Athens": "Eastern European Time - Athens (EET)",
    "Europe/Moscow": "Moscow Time (MSK)",
    // Asia
    "Asia/Dubai": "Gulf Standard Time (GST)",
    "Asia/Karachi": "Pakistan Standard Time (PKT)",
    "Asia/Kolkata": "India Standard Time (IST)",
    "Asia/Dhaka": "Bangladesh Standard Time (BST)",
    "Asia/Bangkok": "Indochina Time (ICT)",
    "Asia/Singapore": "Singapore Time (SGT)",
    "Asia/Hong_Kong": "Hong Kong Time (HKT)",
    "Asia/Shanghai": "China Standard Time (CST)",
    "Asia/Seoul": "Korea Standard Time (KST)",
    "Asia/Tokyo": "Japan Standard Time (JST)",
    "Asia/Manila": "Philippine Time (PHT)",
    "Asia/Jakarta": "Western Indonesia Time (WIB)",
    // Oceania
    "Australia/Sydney": "Australian Eastern Time (AET)",
    "Australia/Melbourne": "Australian Eastern Time - Melbourne (AET)",
    "Australia/Brisbane": "Australian Eastern Time - Brisbane (AET)",
    "Australia/Perth": "Australian Western Time (AWST)",
    "Pacific/Auckland": "New Zealand Time (NZST)",
    // Africa
    "Africa/Cairo": "Eastern European Time - Cairo (EET)",
    "Africa/Johannesburg": "South Africa Standard Time (SAST)",
    "Africa/Lagos": "West Africa Time (WAT)",
  };
  return labels[tz] || tz;
}

// Helper to parse windows from profile (handles both old and new formats)
function parseWindowsFromProfile(windows: any): { presets: StudyWindow[]; customs: CustomTimeRange[] } {
  if (!windows || !Array.isArray(windows)) {
    return { presets: [], customs: [] };
  }
  
  // Old format: list of strings
  if (typeof windows[0] === "string") {
    return { presets: windows as StudyWindow[], customs: [] };
  }
  
  // New format: list of configs
  const presets: StudyWindow[] = [];
  const customs: CustomTimeRange[] = [];
  
  for (const config of windows) {
    if (config?.type === "preset" && typeof config.value === "string") {
      presets.push(config.value as StudyWindow);
    } else if (config?.type === "custom" && config.value) {
      const custom = config.value as CustomTimeRange;
      if (custom.start && custom.end) {
        customs.push(custom);
      }
    }
  }
  
  return { presets, customs };
}

export function SettingsView() {
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const { data: energyLogs } = useEnergyLogs();
  const { data: todayEnergy } = useTodayEnergy();
  const [selectedPresets, setSelectedPresets] = useState<StudyWindow[]>([]);
  const [customRanges, setCustomRanges] = useState<CustomTimeRange[]>([]);
  const [selectedTimezone, setSelectedTimezone] = useState<string>("UTC");
  const { startDemo } = useDemoMode();

  useEffect(() => {
    if (profile) {
      const parsed = parseWindowsFromProfile(profile.preferred_study_windows);
      setSelectedPresets(parsed.presets);
      setCustomRanges(parsed.customs);
      setSelectedTimezone(profile.timezone || "UTC");
    }
  }, [profile]);

  const handleUseCurrentTimezone = () => {
    try {
      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezones.includes(detectedTimezone)) {
        setSelectedTimezone(detectedTimezone);
        toast({
          title: "Timezone updated",
          description: `Set to ${getTimezoneLabel(detectedTimezone)}`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Timezone not supported",
          description: `Detected timezone "${detectedTimezone}" is not in our list. Please select manually.`,
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Detection failed",
        description: "Could not detect your timezone. Please select manually.",
      });
    }
  };

  const handleToggleWindow = (window: StudyWindow, checked: boolean) => {
    setSelectedPresets((prev) => {
      if (checked) {
        return [...new Set([...prev, window])];
      }
      return prev.filter((item) => item !== window);
    });
  };

  const handleAddCustomRange = () => {
    setCustomRanges((prev) => [...prev, { start: "09:00", end: "11:00" }]);
  };

  const handleUpdateCustomRange = (index: number, field: "start" | "end", value: string) => {
    setCustomRanges((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleRemoveCustomRange = (index: number) => {
    setCustomRanges((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const fullNameEntry = formData.get("fullName");
    if (!profile) {
      return;
    }
    
    // Use selectedTimezone state instead of formData (since Select might not update formData properly)
    const timezoneToUse = selectedTimezone || profile.timezone;
    
    // Build windows array in new format
    const windows: StudyWindowConfig[] = [
      ...selectedPresets.map((w) => ({ type: "preset" as const, value: w })),
      ...customRanges.map((r) => ({ type: "custom" as const, value: r })),
    ];
    
    updateProfile.mutate(
      {
        full_name: typeof fullNameEntry === "string" ? fullNameEntry : "",
        timezone: timezoneToUse,
        weekly_study_hours: Number(formData.get("weeklyHours")),
        max_session_length: Number(formData.get("maxSession")),
        break_duration: Number(formData.get("breakDuration")),
        energy_tagging_enabled: formData.get("energyTagging") === "on",
        preferred_study_windows: windows.length > 0 ? windows : undefined,
      },
      {
        onSuccess: () =>
          toast({
            title: "Preferences updated",
            description: "Your scheduling engine will reflect these changes. Regenerate your schedule to apply."
          })
      }
    );
  };

  if (isLoading || !profile) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Settings</h1>
          <p className="text-xs text-muted-foreground/80 mt-1">
            💡 <strong>First time?</strong> Configure your timezone, weekly study hours, and preferred study times to get personalized schedules.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Tune how the AI coach plans your study time and tracks your energy.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent>
              <AccountManagementSection profile={profile} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Study preferences</CardTitle>
            </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Name</Label>
                  <Input id="fullName" name="fullName" defaultValue={profile.full_name ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <div className="flex gap-2">
                    <Select value={selectedTimezone} onValueChange={setSelectedTimezone} name="timezone">
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {timezones.map((zone) => (
                          <SelectItem key={zone} value={zone}>
                            {getTimezoneLabel(zone)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleUseCurrentTimezone}
                      className="flex-shrink-0"
                    >
                      Use current timezone
                    </Button>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="weeklyHours">Weekly study hours</Label>
                  <Input
                    id="weeklyHours"
                    name="weeklyHours"
                    type="number"
                    min={0}
                    defaultValue={profile.weekly_study_hours}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxSession">Max session length (min)</Label>
                  <Input
                    id="maxSession"
                    name="maxSession"
                    type="number"
                    min={15}
                    defaultValue={profile.max_session_length}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="breakDuration">Break duration (min)</Label>
                  <Input
                    id="breakDuration"
                    name="breakDuration"
                    type="number"
                    min={5}
                    defaultValue={profile.break_duration}
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Preferred study windows</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-muted-foreground cursor-help">?</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">
                          Choose preset windows or create custom time ranges. Sessions will only be scheduled within these times.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                
                {/* Preset Windows */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Quick presets</p>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {studyWindows.map((window) => (
                      <label
                        key={window}
                        className="flex items-center gap-2 rounded-lg border border-border/60 bg-white/70 px-3 py-2 text-sm hover:bg-white/90 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedPresets.includes(window)}
                          onCheckedChange={(checked) => handleToggleWindow(window, Boolean(checked))}
                        />
                        <span className="capitalize">{window}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                {/* Custom Time Ranges */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground">Custom time ranges</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddCustomRange}
                      className="h-7 text-xs gap-1.5"
                    >
                      <Plus className="h-3 w-3" />
                      Add range
                    </Button>
                  </div>
                  {customRanges.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      No custom ranges. Add one to schedule sessions at specific times.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {customRanges.map((range, index) => (
                        <div
                          key={`custom-${index}-${range.start}-${range.end}`}
                          className="flex items-center gap-2 rounded-lg border border-border/60 bg-white/70 p-3"
                        >
                          <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex items-center gap-2 flex-1">
                            <Input
                              type="time"
                              value={range.start}
                              onChange={(e) => handleUpdateCustomRange(index, "start", e.target.value)}
                              className="h-8 text-xs"
                            />
                            <span className="text-xs text-muted-foreground">to</span>
                            <Input
                              type="time"
                              value={range.end}
                              onChange={(e) => handleUpdateCustomRange(index, "end", e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveCustomRange(index)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Energy tagging</p>
                  <p className="text-xs text-muted-foreground">
                    Allow the coach to adapt plans based on daily energy levels.
                  </p>
                </div>
                <Switch name="energyTagging" defaultChecked={profile.energy_tagging_enabled} />
              </div>
              <Button type="submit" className="w-full sm:w-auto" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? "Saving..." : "Save preferences"}
              </Button>
            </form>
          </CardContent>
        </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Recent energy tags</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-white/70 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">Today</p>
              <p className="text-xs text-muted-foreground">
                {todayEnergy ? `Energy: ${todayEnergy.level}` : "No entry yet"}
              </p>
            </div>
            <div className="space-y-2">
              {energyLogs?.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-white/70 px-3 py-2"
                >
                  <p className="text-sm text-foreground">{formatDate(log.day)}</p>
                  <Badge variant="outline">{log.level}</Badge>
                </div>
              ))}
              {(energyLogs?.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">
                  Tag your energy each day to teach the coach how you work best.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Demo Mode Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Watch Demo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Take a guided tour of all SSC features. Perfect for learning what the app can do or presenting to others.
          </p>
          <Button 
            onClick={startDemo}
            className="w-full gap-2"
          >
            <Play className="h-4 w-4" />
            Start Guided Demo
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            ~3 minutes • Keyboard shortcuts available
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

interface AccountManagementSectionProps {
  readonly profile: UserProfile | undefined;
}

function AccountManagementSection({ profile }: AccountManagementSectionProps) {
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { refetch: refetchProfile } = useProfile();

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!profile) return;

    const formData = new FormData(e.currentTarget);
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords don't match",
        description: "New password and confirmation must match.",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "Password must be at least 8 characters long.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
      setShowChangePassword(false);
      (e.target as HTMLFormElement).reset();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || error?.message || "Failed to change password";
      toast({
        variant: "destructive",
        title: "Failed to change password",
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!profile) return;

    const formData = new FormData(e.currentTarget);
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords don't match",
        description: "New password and confirmation must match.",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "Password must be at least 8 characters long.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword(newPassword);
      toast({
        title: "Password reset",
        description: "Your password has been reset successfully. You can now log in with your new password.",
      });
      setShowResetPassword(false);
      (e.target as HTMLFormElement).reset();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || error?.message || "Failed to reset password";
      toast({
        variant: "destructive",
        title: "Failed to reset password",
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!profile) return;

    const formData = new FormData(e.currentTarget);
    const newEmail = formData.get("newEmail") as string;
    const password = formData.get("password") as string;

    if (!newEmail || !password) {
      toast({
        variant: "destructive",
        title: "Missing information",
        description: "Please provide both new email and password.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await changeEmail(newEmail, password);
      await refetchProfile();
      toast({
        title: "Email changed",
        description: "Your email has been updated successfully.",
      });
      setShowChangeEmail(false);
      (e.target as HTMLFormElement).reset();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || error?.message || "Failed to change email";
      toast({
        variant: "destructive",
        title: "Failed to change email",
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="space-y-4">
      {/* Email Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <Label>Email</Label>
        </div>
        <div className="flex items-center gap-2">
          <Input value={profile.email} disabled className="flex-1" />
          <Dialog open={showChangeEmail} onOpenChange={setShowChangeEmail}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Change
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change Email</DialogTitle>
                <DialogDescription>
                  Enter your new email address and current password to confirm.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleChangeEmail} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newEmail">New Email</Label>
                  <Input
                    id="newEmail"
                    name="newEmail"
                    type="email"
                    required
                    placeholder="new@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emailPassword">Current Password</Label>
                  <Input
                    id="emailPassword"
                    name="password"
                    type="password"
                    required
                    placeholder="Enter your password"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowChangeEmail(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Changing..." : "Change Email"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Password Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <Label>Password</Label>
        </div>
        <div className="flex gap-2">
          <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1">
                <KeyRound className="h-4 w-4 mr-2" />
                Change Password
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change Password</DialogTitle>
                <DialogDescription>
                  Enter your current password and choose a new one.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    name="currentPassword"
                    type="password"
                    required
                    placeholder="Enter current password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    name="newPassword"
                    type="password"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={8}
                    placeholder="Confirm new password"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowChangePassword(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Changing..." : "Change Password"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={showResetPassword} onOpenChange={setShowResetPassword}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1">
                <Lock className="h-4 w-4 mr-2" />
                Reset Password
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset Password</DialogTitle>
                <DialogDescription>
                  Forgot your password? Since you're logged in, you can reset it without email verification.
                  Enter a new password below.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="resetNewPassword">New Password</Label>
                  <Input
                    id="resetNewPassword"
                    name="newPassword"
                    type="password"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resetConfirmPassword">Confirm New Password</Label>
                  <Input
                    id="resetConfirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={8}
                    placeholder="Confirm new password"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowResetPassword(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Resetting..." : "Reset Password"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <p className="text-xs text-muted-foreground">
          Use "Reset Password" if you forgot your current password (no email verification needed while logged in).
        </p>
      </div>
    </div>
  );
}

