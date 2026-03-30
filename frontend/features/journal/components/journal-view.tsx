"use client";

import { useState, useMemo } from "react";
import {
  BookOpen,
  Clock,
  Filter,
  MessageSquare,
  Zap,
  FileText,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorBanner } from "@/components/query-error-banner";
import {
  collectJournalSubjects,
  filterJournalEntries,
  type JournalTypeFilter,
} from "@/lib/journal-filters";
import { useStudyJournal } from "../hooks";
import type { JournalEntry } from "../api";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function groupByDate(entries: JournalEntry[]): Map<string, JournalEntry[]> {
  const groups = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const key = entry.date;
    const existing = groups.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }
  return groups;
}

function EnergyBadge({ level }: { readonly level: string }) {
  const colors: Record<string, string> = {
    high: "bg-green-100 text-green-700 border-green-200",
    medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    low: "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${colors[level] ?? "bg-muted text-muted-foreground border-border"}`}
    >
      <Zap className="h-3 w-3" />
      {level}
    </span>
  );
}

function SessionNoteCard({ entry }: { readonly entry: JournalEntry }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <FileText className="h-4 w-4" />
        </div>
        <div className="mt-1 flex-1 w-px bg-border" />
      </div>
      <div className="flex-1 pb-4">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-sm font-medium">Session Note</span>
          {entry.subject && (
            <Badge variant="outline" className="text-xs">
              {entry.subject}
            </Badge>
          )}
          {entry.duration_minutes != null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {entry.duration_minutes}min
            </span>
          )}
          {entry.energy_level && <EnergyBadge level={entry.energy_level} />}
        </div>
        <p className="text-sm text-foreground/80 whitespace-pre-line">
          {entry.content}
        </p>
      </div>
    </div>
  );
}

function ReflectionCard({ entry }: { readonly entry: JournalEntry }) {
  const sections = [
    { label: "What worked", icon: Lightbulb, value: entry.worked },
    { label: "What was challenging", icon: AlertTriangle, value: entry.challenging },
    { label: "AI Summary", icon: MessageSquare, value: entry.summary },
    { label: "AI Suggestion", icon: Lightbulb, value: entry.suggestion },
  ].filter((s) => s.value);

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-purple-600">
          <BookOpen className="h-4 w-4" />
        </div>
        <div className="mt-1 flex-1 w-px bg-border" />
      </div>
      <div className="flex-1 pb-4">
        <span className="text-sm font-medium mb-2 block">Daily Reflection</span>
        <div className="space-y-2">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="rounded-md bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Icon className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {s.label}
                  </span>
                </div>
                <p className="text-sm text-foreground/80 whitespace-pre-line">
                  {s.value}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function JournalView() {
  const { data, isLoading, isError, refetch } = useStudyJournal();
  const [typeFilter, setTypeFilter] = useState<JournalTypeFilter>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");

  const subjects = useMemo(() => {
    if (!data) return [];
    return collectJournalSubjects(data.entries);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return filterJournalEntries(data.entries, typeFilter, subjectFilter);
  }, [data, typeFilter, subjectFilter]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return <QueryErrorBanner onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
          Study Journal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your session notes and daily reflections in one place.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as JournalTypeFilter)}
          >
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entries</SelectItem>
              <SelectItem value="session_note">Session notes</SelectItem>
              <SelectItem value="reflection">Reflections</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {subjects.length > 0 && (
          <Select
            value={subjectFilter}
            onValueChange={setSubjectFilter}
          >
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(typeFilter !== "all" || subjectFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTypeFilter("all");
              setSubjectFilter("all");
            }}
          >
            Clear filters
          </Button>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Entries */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">
              No journal entries yet
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Session notes and daily reflections will appear here as you study.
              Add notes during focus sessions or reflect on your day from the
              dashboard.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([dateKey, entries]) => (
            <div key={dateKey}>
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-2 pt-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {formatDate(dateKey)}
                </h2>
              </div>
              <Card>
                <CardContent className="pt-4">
                  {entries.map((entry, idx) => (
                    <div key={`${entry.type}-${entry.timestamp}-${idx}`}>
                      {entry.type === "session_note" ? (
                        <SessionNoteCard entry={entry} />
                      ) : (
                        <ReflectionCard entry={entry} />
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
