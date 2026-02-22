import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Target, Trash2, MoreVertical, CheckCircle2, Pause, Play, Edit, Plus } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import MilestoneCard from "@/components/MilestoneCard";
import GoalTaskItem from "@/components/GoalTaskItem";
import GoalEditDialog from "@/components/GoalEditDialog";
import AddMilestoneDialog from "@/components/AddMilestoneDialog";
import AddTaskToMilestoneDialog from "@/components/AddTaskToMilestoneDialog";
import { supabase } from "@/integrations/supabase/client";
import { useGoals, useMilestones, type Goal } from "@/hooks/useGoals";
import { useGoalProgress, type OccurrenceRecord } from "@/hooks/useGoalProgress";
import { useToast } from "@/hooks/use-toast";

const categoryColors: Record<string, string> = {
  work: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  personal: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  learning: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  health: "bg-green-500/10 text-green-500 border-green-500/20",
  other: "bg-muted text-muted-foreground border-border",
};

export default function GoalDetail() {
  const { goalId } = useParams<{ goalId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { goals, updateGoal, deleteGoal, recalculateProgress, fetchGoals } = useGoals();
  const { milestones, loading: msLoading, createMilestone, fetchMilestones } = useMilestones(goalId);
  const { recalculateGoalProgress, toggleTodayOccurrence, getTodayOccurrences, getOccurrenceStats } = useGoalProgress();
  const [milestoneTasks, setMilestoneTasks] = useState<Record<string, any[]>>({});
  const [timeInvested, setTimeInvested] = useState(0);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [addTaskMilestone, setAddTaskMilestone] = useState<{ id: string; title: string } | null>(null);
  const [todayOccurrences, setTodayOccurrences] = useState<Record<string, OccurrenceRecord>>({});
  const [occurrenceStats, setOccurrenceStats] = useState<Record<string, { total: number; completed: number; streak: number }>>({});

  const goal = goals.find((g) => g.id === goalId);

  const fetchTasksForMilestones = useCallback(async () => {
    if (!goalId) return;
    const { data } = await (supabase.from("tasks").select("*") as any).eq("goal_id", goalId);
    if (data) {
      const grouped: Record<string, any[]> = {};
      const recurringIds: string[] = [];
      for (const t of data as any[]) {
        const msId = t.milestone_id || "__unlinked";
        if (!grouped[msId]) grouped[msId] = [];
        grouped[msId].push(t);
        if (t.repeat_enabled) recurringIds.push(t.id);
      }
      setMilestoneTasks(grouped);

      // Fetch today's occurrences for recurring tasks
      if (recurringIds.length > 0) {
        const todayMap = await getTodayOccurrences(recurringIds);
        setTodayOccurrences(todayMap);

        // Fetch stats for each recurring task
        const statsMap: Record<string, { total: number; completed: number; streak: number }> = {};
        for (const id of recurringIds) {
          statsMap[id] = await getOccurrenceStats(id);
        }
        setOccurrenceStats(statsMap);
      }
    }
  }, [goalId, getTodayOccurrences, getOccurrenceStats]);

  const fetchTimeInvested = useCallback(async () => {
    if (!goalId) return;
    const { data: tasks } = await (supabase.from("tasks").select("id") as any).eq("goal_id", goalId);
    if (!tasks || tasks.length === 0) return;
    const taskIds = tasks.map((t: any) => t.id);
    const { data: sessions } = await supabase.from("work_sessions").select("time_spent").in("task_id", taskIds);
    if (sessions) {
      setTimeInvested(sessions.reduce((sum: number, s: any) => sum + (s.time_spent || 0), 0));
    }
  }, [goalId]);

  useEffect(() => {
    fetchTasksForMilestones();
    fetchTimeInvested();
  }, [fetchTasksForMilestones, fetchTimeInvested, milestones]);

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    // Check if this is a recurring task
    const allTasks = Object.values(milestoneTasks).flat();
    const task = allTasks.find((t: any) => t.id === taskId);

    if (task?.repeat_enabled) {
      // Recurring task: toggle today's occurrence only
      await toggleTodayOccurrence(taskId, completed);
      // Use occurrence-aware progress
      if (goalId) await recalculateGoalProgress(goalId);
    } else {
      // Non-recurring task: toggle the task status directly
      await supabase.from("tasks").update({
        status: completed ? "completed" : "not_started",
        completed_at: completed ? new Date().toISOString() : null,
      }).eq("id", taskId);
      // Use occurrence-aware progress (handles mixed recurring/non-recurring)
      if (goalId) await recalculateGoalProgress(goalId);
    }

    await fetchTasksForMilestones();
    await fetchGoals();
  };

  const handleDelete = async () => {
    if (!goalId) return;
    await deleteGoal(goalId);
    navigate("/goals");
    toast({ title: "Goal deleted" });
  };

  const handleStatusChange = async (status: string) => {
    if (!goalId) return;
    await updateGoal(goalId, { status } as any);
    toast({ title: `Goal ${status === "completed" ? "completed! 🎉" : status}` });
  };

  const handleEditSave = async (updates: Partial<Goal>) => {
    if (!goalId) return;
    await updateGoal(goalId, updates);
    toast({ title: "Goal updated" });
  };

  const handleAddMilestone = async (data: { title: string; description: string; target_date: string }) => {
    if (!goalId) return;
    await createMilestone({
      title: data.title,
      description: data.description || null,
      target_date: data.target_date ? new Date(data.target_date).toISOString() : null,
      order_index: milestones.length,
      status: milestones.length === 0 ? "active" : "pending",
    } as any);
    toast({ title: "Milestone added" });
  };

  const handleAddTask = async (milestoneId: string, data: { title: string; priority: string; estimated_duration: number | null }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !goalId) return;
    await supabase.from("tasks").insert({
      user_id: user.id,
      title: data.title,
      priority: data.priority,
      estimated_duration: data.estimated_duration,
      category: goal?.category || "other",
      goal_id: goalId,
      milestone_id: milestoneId,
    } as any);
    await fetchTasksForMilestones();
    if (goalId) await recalculateProgress(goalId);
    toast({ title: "Task added" });
  };

  if (!goal) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/goals")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Goals
        </Button>
        <p className="text-muted-foreground text-center py-16">Goal not found</p>
      </div>
    );
  }

  const daysLeft = goal.target_date ? differenceInDays(new Date(goal.target_date), new Date()) : null;
  const hours = Math.floor(timeInvested / 60);
  const mins = timeInvested % 60;
  const totalTasks = Object.values(milestoneTasks).flat().length;
  const completedTasks = Object.values(milestoneTasks).flat().filter((t: any) => t.status === "completed").length;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/goals")} className="shrink-0 mt-0.5">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className={`text-[10px] capitalize ${categoryColors[goal.category] || categoryColors.other}`}>
              {goal.category}
            </Badge>
            {goal.status !== "active" && (
              <Badge variant="outline" className="text-[10px] capitalize">{goal.status}</Badge>
            )}
          </div>
          <h1 className="font-heading text-xl leading-tight">{goal.title}</h1>
          {goal.description && (
            <p className="text-sm text-muted-foreground mt-1">{goal.description}</p>
          )}
          {goal.target_date && (
            <p className="text-xs text-muted-foreground mt-1">
              Target: {format(new Date(goal.target_date), "MMM d, yyyy")}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
              <Edit className="h-4 w-4 mr-2" /> Edit Goal
            </DropdownMenuItem>
            {goal.status === "active" && (
              <>
                <DropdownMenuItem onClick={() => handleStatusChange("completed")}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Mark Completed
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("paused")}>
                  <Pause className="h-4 w-4 mr-2" /> Pause
                </DropdownMenuItem>
              </>
            )}
            {goal.status === "paused" && (
              <DropdownMenuItem onClick={() => handleStatusChange("active")}>
                <Play className="h-4 w-4 mr-2" /> Resume
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleDelete} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" /> Delete Goal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{goal.progress}% complete</span>
          <span className="text-muted-foreground text-xs">{completedTasks}/{totalTasks} tasks</span>
        </div>
        <Progress value={goal.progress} className="h-2" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-3 text-center">
          <p className="text-2xl font-heading">
            {daysLeft !== null ? (daysLeft < 0 ? `${Math.abs(daysLeft)}` : daysLeft) : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {daysLeft !== null && daysLeft < 0 ? "Days Overdue" : "Days Left"}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3 text-center">
          <p className="text-2xl font-heading">{hours > 0 ? `${hours}h` : `${mins}m`}</p>
          <p className="text-[10px] text-muted-foreground">Invested</p>
        </div>
        <div className="rounded-xl border bg-card p-3 text-center">
          <p className="text-2xl font-heading">{milestones.length}</p>
          <p className="text-[10px] text-muted-foreground">Milestones</p>
        </div>
      </div>

      {/* Success Criteria */}
      {goal.success_criteria && (
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Success Criteria</p>
          <p className="text-sm">{goal.success_criteria}</p>
        </div>
      )}

      {/* Milestones Timeline */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-sm">Milestones</h2>
          <Button variant="outline" size="sm" onClick={() => setShowAddMilestone(true)} className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" /> Add Milestone
          </Button>
        </div>
        {msLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : milestones.length === 0 ? (
          <div className="text-center py-8 rounded-xl border border-dashed">
            <p className="text-sm text-muted-foreground">No milestones yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add milestones to break down your goal</p>
          </div>
        ) : (
          <div className="space-y-0">
            {milestones.map((ms, i) => (
              <MilestoneCard
                key={ms.id}
                milestone={ms}
                tasks={milestoneTasks[ms.id] || []}
                onToggleTask={handleToggleTask}
                onAddTask={() => setAddTaskMilestone({ id: ms.id, title: ms.title })}
                isLast={i === milestones.length - 1}
                renderTask={(task) => (
                  <GoalTaskItem
                    task={task}
                    todayOccurrence={todayOccurrences[task.id] || null}
                    occurrenceStats={occurrenceStats[task.id]}
                    onToggle={handleToggleTask}
                  />
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <GoalEditDialog open={showEditDialog} onClose={() => setShowEditDialog(false)} goal={goal} onSave={handleEditSave} />
      <AddMilestoneDialog open={showAddMilestone} onClose={() => setShowAddMilestone(false)} onSave={handleAddMilestone} />
      {addTaskMilestone && (
        <AddTaskToMilestoneDialog
          open={!!addTaskMilestone}
          onClose={() => setAddTaskMilestone(null)}
          milestoneName={addTaskMilestone.title}
          onSave={(data) => handleAddTask(addTaskMilestone.id, data)}
        />
      )}
    </div>
  );
}
