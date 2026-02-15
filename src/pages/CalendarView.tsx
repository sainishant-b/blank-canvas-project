import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TaskCalendar } from "@/components/TaskCalendar";
import TaskDialog from "@/components/TaskDialog";
import { Button } from "@/components/ui/button";
import { Calendar, List, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { CalendarAIPanel } from "@/components/CalendarAIPanel";
import { ScheduleProposalSheet } from "@/components/ScheduleProposalSheet";
import { useCalendarAI } from "@/hooks/useCalendarAI";

interface Task {
  id: string;
  title: string;
  due_date: string | null;
  priority: string;
  status: string;
  category: string;
  [key: string]: unknown;
}

export default function CalendarView() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [loading, setLoading] = useState(true);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showProposals, setShowProposals] = useState(false);
  const {
    requestSchedule,
    toggleProposal,
    applyApprovedProposals,
    dismissProposals,
    proposals,
    overallReasoning,
    conflicts,
    isLoading: isAILoading,
    hasProposals,
  } = useCalendarAI();

  // Auto-show proposals when they arrive
  useEffect(() => {
    if (hasProposals) setShowProposals(true);
  }, [hasProposals]);

  const handleUpdateTask = async (taskId: string, updates: Record<string, unknown>) => {
    const { error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", taskId);
    if (error) throw error;
    await fetchTasks();
  };

  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)
        .order("due_date", { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  const handleTaskClick = (taskId: string) => {
    navigate(`/task/${taskId}`);
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setIsTaskDialogOpen(true);
  };

  const handleSaveTask = async (taskData: Partial<Task>, pendingSubtasks?: { title: string; estimated_duration: number }[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const newTask = {
        ...taskData,
        user_id: user.id,
        due_date: selectedDate?.toISOString(),
      } as { priority: string; title: string; user_id: string; due_date?: string };

      const { data: insertedData, error } = await supabase.from("tasks").insert([newTask]).select();

      if (error) throw error;

      // Insert AI-suggested subtasks if any
      if (pendingSubtasks && pendingSubtasks.length > 0 && insertedData?.[0]?.id) {
        const subtaskRows = pendingSubtasks.map((st) => ({
          task_id: insertedData[0].id,
          user_id: user.id,
          title: st.title,
        }));
        const { error: subtaskError } = await supabase.from("subtasks").insert(subtaskRows);
        if (subtaskError) {
          console.error("Failed to insert AI subtasks:", subtaskError);
          toast.error("Task created but failed to add subtasks");
        } else {
          toast.success(`Added ${pendingSubtasks.length} AI subtask${pendingSubtasks.length > 1 ? "s" : ""}`);
        }
      }

      toast.success("Task created successfully");
      fetchTasks();
      setIsTaskDialogOpen(false);
      setSelectedDate(null);
    } catch (error) {
      console.error("Error creating task:", error);
      toast.error("Failed to create task");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading calendar...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="font-serif text-2xl">Calendar</h1>
            </div>
            
            <div className="flex gap-2">
              <CalendarAIPanel
                onRequest={requestSchedule}
                isLoading={isAILoading}
                hasProposals={hasProposals}
                onShowProposals={() => setShowProposals(true)}
              />
              <Button
                variant={viewMode === "month" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("month")}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Month
              </Button>
              <Button
                variant={viewMode === "week" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("week")}
              >
                <List className="h-4 w-4 mr-2" />
                Week
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Calendar */}
      <main className="container mx-auto px-4 py-8">
        <TaskCalendar
          tasks={tasks}
          onTaskClick={handleTaskClick}
          onDateClick={handleDateClick}
          viewMode={viewMode}
        />
      </main>

      {/* Task Dialog */}
      <TaskDialog
        open={isTaskDialogOpen}
        onClose={() => {
          setIsTaskDialogOpen(false);
          setSelectedDate(null);
        }}
        onSave={handleSaveTask}
      />

      {/* AI Schedule Proposals */}
      <ScheduleProposalSheet
        open={showProposals}
        onOpenChange={setShowProposals}
        proposals={proposals}
        overallReasoning={overallReasoning}
        conflicts={conflicts}
        onToggle={toggleProposal}
        onApprove={() => applyApprovedProposals(handleUpdateTask)}
        onDismiss={() => { dismissProposals(); setShowProposals(false); }}
      />
    </div>
  );
}
