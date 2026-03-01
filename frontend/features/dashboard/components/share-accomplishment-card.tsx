"use client";

import { useRef, useCallback, useState } from "react";
import { Share2 } from "lucide-react";
import { toPng } from "html-to-image";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import type { WeeklyRecapData } from "@/features/dashboard/api";

function formatWeekRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  e.setDate(e.getDate() - 1);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
}

/** Shareable card rendered off-screen for capture. Fixed dimensions for consistent PNG output. */
function ShareCardPreview({ data }: { readonly data: WeeklyRecapData }) {
  const stats = data.stats;
  const adherence = stats?.adherence ?? 0;
  const hoursPercent =
    stats && stats.hours_target > 0
      ? Math.min(
          100,
          Math.round((stats.hours_studied / stats.hours_target) * 100)
        )
      : 0;

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden shadow-lg"
      style={{
        width: 400,
        minHeight: 480,
        background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)",
        color: "#f8fafc",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <p
          className="text-xs font-medium uppercase tracking-widest"
          style={{ color: "#94a3b8" }}
        >
          Weekly Study Report
        </p>
        <p className="mt-1 text-lg font-semibold">
          {formatWeekRange(data.week_start, data.week_end)}
        </p>
        <p className="mt-2 text-sm" style={{ color: "#cbd5e1" }}>
          SSC · Smart Study Companion
        </p>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="flex-1 px-6 pb-6 flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <StatBlock
              label="Hours studied"
              value={`${stats.hours_studied.toFixed(1)}h`}
              sub={`of ${stats.hours_target}h`}
            />
            <StatBlock
              label="Adherence"
              value={`${adherence}%`}
              sub="sessions completed"
            />
            <StatBlock
              label="Sessions"
              value={`${stats.sessions_completed}/${stats.sessions_total}`}
              sub="completed"
            />
            <StatBlock
              label="Streak"
              value={`${stats.streak} day${stats.streak === 1 ? "" : "s"}`}
              sub="focused"
            />
            {stats.tasks_completed > 0 && (
              <StatBlock
                label="Tasks done"
                value={String(stats.tasks_completed)}
                sub="completed"
              />
            )}
          </div>

          {/* Progress bars */}
          <div className="space-y-3">
            <div>
              <div
                className="flex justify-between text-xs mb-1"
                style={{ color: "#94a3b8" }}
              >
                <span>Adherence</span>
                <span className="text-slate-200">{adherence}%</span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: "rgba(148,163,184,0.3)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${adherence}%`,
                    backgroundColor: "#22c55e",
                  }}
                />
              </div>
            </div>
            <div>
              <div
                className="flex justify-between text-xs mb-1"
                style={{ color: "#94a3b8" }}
              >
                <span>Weekly hours</span>
                <span className="text-slate-200">{hoursPercent}%</span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: "rgba(148,163,184,0.3)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${hoursPercent}%`,
                    backgroundColor: "#3b82f6",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBlock({
  label,
  value,
  sub,
}: {
  readonly label: string;
  readonly value: string;
  readonly sub: string;
}) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
    >
      <p className="text-xs" style={{ color: "#94a3b8" }}>
        {label}
      </p>
      <p className="text-lg font-semibold mt-0.5">{value}</p>
      <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
        {sub}
      </p>
    </div>
  );
}

function buildShareText(data: WeeklyRecapData): string {
  const stats = data.stats;
  const range = formatWeekRange(data.week_start, data.week_end);
  if (!stats) return `My weekly study recap (${range}) – SSC`;

  const parts: string[] = [
    `📚 ${range}`,
    `Hours: ${stats.hours_studied.toFixed(1)}h / ${stats.hours_target}h`,
    `Adherence: ${stats.adherence}%`,
    `Streak: ${stats.streak} day${stats.streak === 1 ? "" : "s"}`,
  ];
  return parts.join(" · ") + " – SSC";
}

interface ShareAccomplishmentCardProps {
  readonly data: WeeklyRecapData;
}

export function ShareAccomplishmentCard({ data }: ShareAccomplishmentCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = useCallback(async () => {
    if (!cardRef.current || !data?.stats || isSharing) return;

    setIsSharing(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#0f172a",
      });

      const blob = await fetch(dataUrl).then((r) => r.blob());
      const file = new File([blob], "ssc-weekly-recap.png", {
        type: "image/png",
      });

      const shareData: ShareData = {
        title: "My weekly study recap – SSC",
        text: buildShareText(data),
        files: [file],
      };

      if (
        typeof navigator !== "undefined" &&
        navigator.share &&
        navigator.canShare?.(shareData)
      ) {
        await navigator.share(shareData);
        toast({
          title: "Shared",
          description: "Your weekly recap was shared successfully.",
        });
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `ssc-weekly-recap-${data.week_start.slice(0, 10)}.png`;
        a.click();
        await navigator.clipboard.writeText(buildShareText(data));
        toast({
          title: "Ready to share",
          description: "Image downloaded and text copied to clipboard.",
        });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      toast({
        variant: "destructive",
        title: "Share failed",
        description: "Could not generate share image. Please try again.",
      });
    } finally {
      setIsSharing(false);
    }
  }, [data, isSharing]);

  if (!data?.has_data || !data?.stats) return null;

  return (
    <>
      {/* Hidden card for capture — fixed position, off-screen */}
      <div
        className="fixed -left-[9999px] top-0"
        style={{ zIndex: -1 }}
        aria-hidden
      >
        <div ref={cardRef}>
          <ShareCardPreview data={data} />
        </div>
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-60 hover:opacity-100"
              onClick={handleShare}
              disabled={isSharing}
              aria-label="Share your weekly accomplishment"
            >
              <Share2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Download or share your weekly stats as an image
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );
}
