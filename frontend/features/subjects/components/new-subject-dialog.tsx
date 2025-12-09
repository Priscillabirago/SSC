"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Subject } from "@/lib/types";
import { useCreateSubject } from "@/features/subjects/hooks";
import { toast } from "@/components/ui/use-toast";

const priorities: Subject["priority"][] = ["low", "medium", "high"];
const difficulties: Subject["difficulty"][] = ["easy", "medium", "hard"];

export function NewSubjectDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    priority: "medium" as Subject["priority"],
    difficulty: "medium" as Subject["difficulty"],
    workload: 3,
    color: "#6366F1",
    exam_date: ""
  });
  const createSubject = useCreateSubject();

  const handleSubmit = () => {
    createSubject.mutate(
      {
        ...form,
        exam_date: form.exam_date || undefined
      },
      {
        onSuccess: () => {
          toast({ title: "Subject added" });
          setOpen(false);
          setForm({
            name: "",
            priority: "medium",
            difficulty: "medium",
            workload: 3,
            color: "#6366F1",
            exam_date: ""
          });
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add subject</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New subject</DialogTitle>
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
              <Label>Workload</Label>
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
              <Label>Accent color</Label>
              <Input
                type="color"
                value={form.color}
                onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Exam date (optional)</Label>
            <Input
              type="date"
              value={form.exam_date}
              onChange={(event) => setForm((prev) => ({ ...prev, exam_date: event.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createSubject.isPending || !form.name.trim()}>
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

