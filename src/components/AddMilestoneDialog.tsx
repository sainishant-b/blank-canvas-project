import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "./DateTimePicker";
import { Check } from "lucide-react";

interface AddMilestoneDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { title: string; description: string; target_date: string }) => void;
}

export default function AddMilestoneDialog({ open, onClose, onSave }: AddMilestoneDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ title, description, target_date: targetDate });
    setTitle("");
    setDescription("");
    setTargetDate("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Add Milestone</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Phase 1: Research" required />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this milestone cover?" rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Target Date</Label>
            <DateTimePicker value={targetDate || undefined} onChange={(val) => setTargetDate(val || "")} placeholder="Pick date" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1"><Check className="h-4 w-4 mr-1" /> Add Milestone</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
