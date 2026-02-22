import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { differenceInDays } from "date-fns";
import { RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Goal } from "@/hooks/useGoals";

const categoryColors: Record<string, string> = {
  work: "bg-blue-500/10 text-blue-500",
  personal: "bg-purple-500/10 text-purple-500",
  learning: "bg-amber-500/10 text-amber-500",
  health: "bg-green-500/10 text-green-500",
  other: "bg-muted text-muted-foreground",
};

function ProgressRing({ progress, size = 56 }: { progress: number; size?: number }) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--accent-green))"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700 ease-out"
      />
    </svg>
  );
}

export default function GoalCard({ goal }: { goal: Goal }) {
  const navigate = useNavigate();
  const [hasRecurring, setHasRecurring] = useState(false);
  const daysLeft = goal.target_date
    ? differenceInDays(new Date(goal.target_date), new Date())
    : null;

  useEffect(() => {
    // Check if this goal has any recurring tasks
    (async () => {
      const { data } = await (supabase
        .from("tasks")
        .select("id") as any)
        .eq("goal_id", goal.id)
        .eq("repeat_enabled", true)
        .limit(1);
      setHasRecurring(data && data.length > 0);
    })();
  }, [goal.id]);

  return (
    <button
      onClick={() => navigate(`/goals/${goal.id}`)}
      className="w-full text-left p-4 rounded-xl border bg-card hover:bg-accent/40 transition-all group"
    >
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <ProgressRing progress={goal.progress} />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold rotate-0">
            {goal.progress}%
          </span>
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <h3 className="font-heading text-sm font-semibold truncate group-hover:text-primary transition-colors">
            {goal.title}
          </h3>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${categoryColors[goal.category] || categoryColors.other}`}>
              {goal.category}
            </span>
            {hasRecurring && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 flex items-center gap-0.5">
                <RotateCcw className="h-2.5 w-2.5" /> Recurring
              </span>
            )}
            {daysLeft !== null && (
              <span className={`text-[10px] font-medium ${daysLeft < 0 ? "text-destructive" : daysLeft < 7 ? "text-warning" : "text-muted-foreground"}`}>
                {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
              </span>
            )}
          </div>

          {goal.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">{goal.description}</p>
          )}
        </div>
      </div>
    </button>
  );
}
