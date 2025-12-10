"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Subject } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { useDeleteSubject, useUpdateSubject } from "@/features/subjects/hooks";
import { toast } from "@/components/ui/use-toast";

const priorities: Subject["priority"][] = ["low", "medium", "high"];
const difficulties: Subject["difficulty"][] = ["easy", "medium", "hard"];

export function SubjectCard({ subject, taskCount = 0, onClick }: Readonly<{ subject: Subject; taskCount?: number; onClick?: () => void }>) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: subject.name,
    priority: subject.priority,
    difficulty: subject.difficulty,
    workload: subject.workload,
    color: subject.color,
    exam_date: subject.exam_date ?? ""
  });
  const updateSubject = useUpdateSubject();
  const deleteSubject = useDeleteSubject();

  const handleSubmit = () => {
    updateSubject.mutate(
      {
        id: subject.id,
        payload: {
          ...form,
          exam_date: form.exam_date || undefined
        }
      },
      {
        onSuccess: () => {
          toast({ title: "Subject updated" });
          setOpen(false);
        }
      }
    );
  };

  const handleDelete = () => {
    deleteSubject.mutate(subject.id, {
      onSuccess: () => toast({ title: "Subject removed" })
    });
  };

  const cardContent = (
    <>
      <CardHeader className="flex items-start justify-between">
        <div className="flex-1">
          <CardTitle className="flex items-center gap-2">
            <span className="inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: subject.color }} />
            {subject.name}
            {taskCount > 0 && (
              <Badge variant="outline" className="ml-2 text-xs">
                {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
              </Badge>
            )}
          </CardTitle>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">Priority: {subject.priority}</Badge>
            <Badge variant="outline">Difficulty: {subject.difficulty}</Badge>
            <Badge variant="outline">Workload: {subject.workload}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm"
                className="gap-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit subject</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select
                      value={form.priority}
                      onValueChange={(value: Subject["priority"]) =>
                        setForm((prev) => ({ ...prev, priority: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {priorities.map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {priority}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Difficulty</Label>
                    <Select
                      value={form.difficulty}
                      onValueChange={(value: Subject["difficulty"]) =>
                        setForm((prev) => ({ ...prev, difficulty: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {difficulties.map((difficulty) => (
                          <SelectItem key={difficulty} value={difficulty}>
                            {difficulty}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Workload (1-5)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      value={form.workload}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, workload: Number(event.target.value) }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Accent Color</Label>
                    <Input
                      type="color"
                      value={form.color}
                      onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Exam date</Label>
                  <Input
                    type="date"
                    value={form.exam_date}
                    onChange={(event) => setForm((prev) => ({ ...prev, exam_date: event.target.value }))}
                  />
                </div>
                <div className="flex justify-between gap-2">
                  <Button type="button" variant="ghost" onClick={handleDelete}>
                    Delete
                  </Button>
                  <Button type="button" onClick={handleSubmit} disabled={updateSubject.isPending}>
                    Save changes
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {subject.exam_date ? (
          <p>Exam on {formatDate(subject.exam_date)}</p>
        ) : (
          <p>No exam scheduled.</p>
        )}
      </CardContent>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left"
      >
        <Card className="hover:shadow-xl transition-all w-full">
          {cardContent}
        </Card>
      </button>
    );
  }

  return (
    <Card className="hover:shadow-xl transition-all">
      {cardContent}
    </Card>
  );
}

