import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import GoalCard from "@/components/GoalCard";
import GoalDialog from "@/components/GoalDialog";
import { useGoals, useMilestones, type Goal } from "@/hooks/useGoals";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function Goals() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { goals, loading, createGoal, fetchGoals } = useGoals();
  const [showDialog, setShowDialog] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [tab, setTab] = useState("active");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate("/auth");
      else setUser(data.user);
    });
  }, [navigate]);

  const handleSave = async (goalData: Partial<Goal>, milestones?: any[]) => {
    const created = await createGoal(goalData);
    if (!created || !user) return;

    // Create milestones and tasks from AI breakdown
    if (milestones && milestones.length > 0) {
      for (let i = 0; i < milestones.length; i++) {
        const ms = milestones[i];
        const { data: msData } = await supabase
          .from("milestones")
          .insert({
            goal_id: created.id,
            user_id: user.id,
            title: ms.title,
            description: ms.description || null,
            target_date: ms.target_date ? new Date(ms.target_date).toISOString() : null,
            order_index: i,
            status: i === 0 ? "active" : "pending",
          } as any)
          .select()
          .single();

        if (msData && ms.tasks) {
          for (const task of ms.tasks) {
            await supabase.from("tasks").insert({
              user_id: user.id,
              title: task.title,
              priority: task.priority || "medium",
              estimated_duration: task.estimated_duration || null,
              category: goalData.category || "other",
              goal_id: created.id,
              milestone_id: (msData as any).id,
            } as any);
          }
        }
      }
      toast({ title: "Goal created with AI plan! 🎯" });
    } else {
      toast({ title: "Goal created! 🎯" });
    }

    setShowDialog(false);
  };

  const filtered = goals.filter((g) => {
    if (tab === "active") return g.status === "active" || g.status === "paused";
    if (tab === "completed") return g.status === "completed";
    return true;
  });

  if (!user) return null;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-6 w-6" />
          <h1 className="font-heading text-2xl">Goals</h1>
        </div>
        <Button onClick={() => setShowDialog(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Goal
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="active" className="flex-1">Active</TabsTrigger>
          <TabsTrigger value="completed" className="flex-1">Completed</TabsTrigger>
          <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Target className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground text-base">
            {tab === "active" ? "No active goals yet" : tab === "completed" ? "No completed goals yet" : "No goals yet"}
          </p>
          <Button variant="outline" size="lg" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Create your first goal
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}

      <GoalDialog open={showDialog} onClose={() => setShowDialog(false)} onSave={handleSave} />
    </div>
  );
}
