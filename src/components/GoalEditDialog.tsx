import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "./DateTimePicker";
import { Check } from "lucide-react";
import type { Goal } from "@/hooks/useGoals";

interface GoalEditDialogProps {
  open: boolean;
  onClose: () => void;
  goal: Goal;
  onSave: (updates: Partial<Goal>) => void;
}

export default function GoalEditDialog({ open, onClose, goal, onSave }: GoalEditDialogProps) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "other",
    success_criteria: "",
    target_date: "",
  });

  useEffect(() => {
    if (open && goal) {
      setFormData({
        title: goal.title,
        description: goal.description || "",
        category: goal.category,
        success_criteria: goal.success_criteria || "",
        target_date: goal.target_date || "",
      });
    }
  }, [open, goal]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: formData.title,
      description: formData.description || null,
      category: formData.category,
      success_criteria: formData.success_criteria || null,
      target_date: formData.target_date ? new Date(formData.target_date).toISOString() : null,
    } as any);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Edit Goal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title *</Label>
            <Input
              id="edit-title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-desc">Description</Label>
            <Textarea
              id="edit-desc"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="learning">Learning</SelectItem>
                  <SelectItem value="health">Health</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target Date</Label>
              <DateTimePicker
                value={formData.target_date || undefined}
                onChange={(val) => setFormData({ ...formData, target_date: val || "" })}
                placeholder="Pick date"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-criteria">Success Criteria</Label>
            <Textarea
              id="edit-criteria"
              value={formData.success_criteria}
              onChange={(e) => setFormData({ ...formData, success_criteria: e.target.value })}
              rows={2}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1">
              <Check className="h-4 w-4 mr-1" /> Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
