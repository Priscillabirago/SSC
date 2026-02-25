"use client";

import { useState } from "react";
import { CalendarDays, Check, Copy, Download, Link2, RefreshCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import { useCalendarToken, useGenerateCalendarToken, useRevokeCalendarToken } from "@/features/schedule/hooks";
import { getCalendarDownloadUrl, getCalendarFeedUrl } from "@/features/schedule/api";
import { getAccessToken } from "@/lib/auth";

function CopyButton({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: "destructive", title: "Failed to copy", description: "Please copy the URL manually." });
    }
  };

  return (
    <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={handleCopy}>
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function SubscribeSection({ feedUrl }: { readonly feedUrl: string }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">Subscribe URL</h4>
      <p className="text-xs text-muted-foreground">
        Paste this URL into your calendar app. It will auto-refresh to stay in sync
        with your latest sessions — including regenerated schedules, completed sessions, and time changes.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border bg-muted/50 px-3 py-2 text-xs break-all select-all">
          {feedUrl}
        </code>
        <CopyButton text={feedUrl} />
      </div>

      <div className="space-y-2.5 pt-2">
        <p className="text-xs font-medium text-foreground">How to subscribe:</p>
        <div className="space-y-2">
          <details className="group rounded-md border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">
              Google Calendar
            </summary>
            <div className="px-3 pb-3 text-xs text-muted-foreground space-y-1">
              <p>1. Open <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="underline text-primary">Google Calendar</a></p>
              <p>2. Click the <strong>+</strong> next to "Other calendars" in the left sidebar</p>
              <p>3. Select <strong>"From URL"</strong></p>
              <p>4. Paste the subscribe URL above and click <strong>"Add calendar"</strong></p>
              <p className="text-amber-600 pt-1">Note: Google Calendar only refreshes subscribed calendars every 12–24 hours, so changes may take a while to appear.</p>
            </div>
          </details>
          <details className="group rounded-md border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">
              Apple Calendar
            </summary>
            <div className="px-3 pb-3 text-xs text-muted-foreground space-y-1">
              <p>1. Open the <strong>Calendar</strong> app on your Mac or iPhone</p>
              <p>2. Go to <strong>File &gt; New Calendar Subscription</strong> (Mac) or <strong>Settings &gt; Calendar &gt; Accounts &gt; Add Account &gt; Other &gt; Add Subscribed Calendar</strong> (iPhone)</p>
              <p>3. Paste the subscribe URL above</p>
              <p>4. Set the auto-refresh interval (recommended: every hour)</p>
            </div>
          </details>
          <details className="group rounded-md border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">
              Outlook
            </summary>
            <div className="px-3 pb-3 text-xs text-muted-foreground space-y-1">
              <p>1. Open <a href="https://outlook.live.com/calendar" target="_blank" rel="noopener noreferrer" className="underline text-primary">Outlook Calendar</a></p>
              <p>2. Click <strong>"Add calendar"</strong> in the sidebar</p>
              <p>3. Select <strong>"Subscribe from web"</strong></p>
              <p>4. Paste the subscribe URL above and give it a name</p>
            </div>
          </details>
        </div>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-xs text-amber-800 space-y-1">
        <p className="font-medium">Sync delay</p>
        <p>
          Calendar apps refresh on their own schedule — not instantly. Google Calendar can take 12–24 hours,
          Apple Calendar can be set to hourly, and Outlook refreshes every few hours.
          The download option always gives you the latest data immediately.
        </p>
      </div>
    </div>
  );
}

export function CalendarExportDialog() {
  const { data: tokenData, isLoading } = useCalendarToken();
  const generateToken = useGenerateCalendarToken();
  const revokeToken = useRevokeCalendarToken();

  const calendarToken = tokenData?.calendar_token ?? null;
  const feedUrl = calendarToken ? getCalendarFeedUrl(calendarToken) : null;

  const handleDownload = async () => {
    try {
      const token = getAccessToken();
      if (!token) {
        toast({ variant: "destructive", title: "Not logged in", description: "Please log in to download." });
        return;
      }
      const url = getCalendarDownloadUrl();
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "ssc-study-sessions.ics";
      link.click();
      URL.revokeObjectURL(link.href);
      toast({ title: "Downloaded", description: "Import this file into your calendar app." });
    } catch {
      toast({ variant: "destructive", title: "Download failed", description: "Please try again." });
    }
  };

  const handleGenerate = () => {
    generateToken.mutate(undefined, {
      onSuccess: () => toast({ title: "Subscribe URL created", description: "You can now add it to your calendar app." }),
      onError: () => toast({ variant: "destructive", title: "Failed to generate URL" }),
    });
  };

  const handleRevoke = () => {
    revokeToken.mutate(undefined, {
      onSuccess: () => toast({ title: "URL revoked", description: "External calendars will no longer sync." }),
      onError: () => toast({ variant: "destructive", title: "Failed to revoke URL" }),
    });
  };

  return (
    <Dialog>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
                <CalendarDays className="h-4 w-4" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Export to Calendar</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Export to Calendar
          </DialogTitle>
          <DialogDescription>
            See your study sessions in Google Calendar, Apple Calendar, or Outlook.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Download section */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Download .ics file</h4>
            <p className="text-xs text-muted-foreground">
              One-time download. Import this file into any calendar app.
            </p>
            <Button variant="outline" className="gap-2 w-full sm:w-auto" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Download .ics
            </Button>
          </div>

          <div className="border-t" />

          {/* Subscribe section */}
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}

          {!isLoading && feedUrl && (
            <>
              <SubscribeSection feedUrl={feedUrl} />
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleGenerate}
                  disabled={generateToken.isPending}
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  {generateToken.isPending ? "Regenerating..." : "Regenerate URL"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={handleRevoke}
                  disabled={revokeToken.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Revoke
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Regenerating creates a new URL and invalidates the old one. Revoke stops all external syncing.
              </p>
            </>
          )}

          {!isLoading && !feedUrl && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Subscribe (auto-sync)</h4>
              <p className="text-xs text-muted-foreground">
                Create a subscribe URL that your calendar app can poll automatically.
                Your sessions will stay in sync without re-downloading.
              </p>
              <Button
                variant="default"
                className="gap-2 w-full sm:w-auto"
                onClick={handleGenerate}
                disabled={generateToken.isPending}
              >
                <Link2 className="h-4 w-4" />
                {generateToken.isPending ? "Creating..." : "Create Subscribe URL"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
