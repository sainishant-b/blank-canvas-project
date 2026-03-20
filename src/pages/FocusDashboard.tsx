import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, List, RefreshCw, Play, MousePointerClick } from "lucide-react";
import { toast } from "sonner";
import { isPast } from "date-fns";
import FocusCard from "@/components/FocusCard";
import UpNextSection from "@/components/UpNextSection";
import TaskDialog from "@/components/TaskDialog";
import ProofUploadDialog from "@/components/ProofUploadDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { invalidateRecommendations } from "@/utils/recommendationCache";
import { isCompletedToday, toggleRepeatCompletion } from "@/utils/repeatCompletionUtils";

const FocusDashboard = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [user, setUser] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showProofDialog, setShowProofDialog] = useState(false);
  const [proofTask, setProofTask] = useState<any>(null);

  // Auth
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (!session) navigate("/auth");
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) navigate("/auth");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) fetchTasks();
  }, [user]);

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load tasks");
      setLoading(false);
      return;
    }

    const tasksWithStatus = await Promise.all(
      (data || []).map(async (task) => {
        if (task.repeat_enabled) {
          const completedToday = await isCompletedToday(task.id);
          return { ...task, isCompletedToday: completedToday };
        }
        return task;
      })
    );

    setTasks(tasksWithStatus);
    setLoading(false);
  };

  // Active (non-completed, non-overdue) tasks sorted by priority then due date
  const activeTasks = tasks
    .filter((t) => t.status !== "completed")
    .filter((t) => !(t.repeat_enabled && t.isCompletedToday))
    .sort((a, b) => {
      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const pa = priorityOrder[a.priority] ?? 1;
      const pb = priorityOrder[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    });

  // Focus task: user-selected or auto-recommend first
  const focusTask = focusTaskId
    ? tasks.find((t) => t.id === focusTaskId) || activeTasks[0] || null
    : activeTasks[0] || null;

  const isRecommended = !focusTaskId && !!focusTask;

  // Up next: next 2-3 tasks after focus
  const upNextTasks = activeTasks.filter((t) => t.id !== focusTask?.id).slice(0, 3);
  const remainingCount = Math.max(0, activeTasks.length - 1 - 3);

  const handleSelectFocus = (task: any) => {
    setFocusTaskId(task.id);
  };

  const handleStartSession = () => {
    if (focusTask) {
      navigate(`/task/${focusTask.id}`);
    }
  };

  const handleSaveTask = async (taskData: any, pendingSubtasks?: { title: string; estimated_duration: number }[]) => {
    const { data: newTaskData, error } = await supabase
      .from("tasks")
      .insert([{ ...taskData, user_id: user.id }])
      .select();

    if (error) {
      toast.error("Failed to create task");
    } else {
      toast.success("Task created!");
      invalidateRecommendations();

      if (pendingSubtasks && pendingSubtasks.length > 0 && newTaskData?.[0]?.id) {
        const subtaskRows = pendingSubtasks.map((st) => ({
          task_id: newTaskData[0].id,
          user_id: user.id,
          title: st.title,
        }));
        await supabase.from("subtasks").insert(subtaskRows);
      }

      // Auto-set as focus if no focus task
      if (!focusTaskId && newTaskData?.[0]) {
        setFocusTaskId(newTaskData[0].id);
      }
    }
    fetchTasks();
  };

  const handlePickTask = () => {
    // Navigate to full task list on old dashboard-like view
    // For now, just pick the first available
    if (activeTasks.length > 0) {
      setFocusTaskId(activeTasks[0].id);
    } else {
      setShowTaskDialog(true);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-lg px-4 py-6 md:py-10 flex flex-col gap-5 min-h-[calc(100vh-80px)]">
        {/* Focus Card */}
        {loading ? (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <FocusCard
            task={focusTask}
            isRecommended={isRecommended}
            onPickTask={handlePickTask}
          />
        )}

        {/* Start Session Button */}
        {focusTask && !loading && (
          <Button
            onClick={handleStartSession}
            className="w-full h-16 text-lg font-heading font-bold rounded-2xl bg-primary text-primary-foreground hover:bg-primary-hover shadow-[var(--shadow-lg)] transition-all"
            style={{ minHeight: 64 }}
          >
            <Play className="h-5 w-5 mr-2 fill-current" />
            START FOCUS SESSION
          </Button>
        )}

        {/* Up Next */}
        {!loading && (
          <UpNextSection
            tasks={upNextTasks}
            totalRemaining={remainingCount}
            onSelectTask={handleSelectFocus}
            onViewAll={() => navigate("/tasks")}
          />
        )}

        {/* Spacer to push quick actions down */}
        <div className="flex-1" />

        {/* Quick Actions */}
        {!loading && (
          <div className="flex items-center justify-center gap-3 pb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowTaskDialog(true);
              }}
              className="text-muted-foreground text-xs gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Task
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/tasks")}
              className="text-muted-foreground text-xs gap-1.5"
            >
              <List className="h-3.5 w-3.5" />
              Dashboard
            </Button>
            {focusTask && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // Cycle to next task
                  const currentIndex = activeTasks.findIndex((t) => t.id === focusTask.id);
                  const nextIndex = (currentIndex + 1) % activeTasks.length;
                  setFocusTaskId(activeTasks[nextIndex]?.id || null);
                }}
                className="text-muted-foreground text-xs gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Change Focus
              </Button>
            )}
          </div>
        )}
      </div>

      <TaskDialog
        open={showTaskDialog}
        onClose={() => setShowTaskDialog(false)}
        onSave={handleSaveTask}
        task={null}
      />

      {showProofDialog && proofTask && (
        <ProofUploadDialog
          open={showProofDialog}
          onClose={() => { setShowProofDialog(false); setProofTask(null); }}
          task={proofTask}
          onVerified={() => {}}
        />
      )}
    </div>
  );
};

export default FocusDashboard;
