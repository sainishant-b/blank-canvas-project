import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getCurrentHourInTimezone(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    return parseInt(formatter.format(now), 10);
  } catch {
    return new Date().getUTCHours();
  }
}

function getTodayInTimezone(timezone: string): string {
  try {
    const now = new Date();
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

function priorityRank(priority: string): number {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    console.log(`Running scheduled notifications at ${now.toISOString()}`);

    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, work_hours_start, work_hours_end, check_in_frequency, timezone");

    if (profileError) {
      console.error("Error fetching profiles:", profileError);
      return new Response(JSON.stringify({ error: "Failed to fetch profiles" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ message: "No profiles found", processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let notificationsSent = 0;
    let usersProcessed = 0;

    for (const profile of profiles) {
      try {
        const userTimezone = profile.timezone || "UTC";
        const currentHour = getCurrentHourInTimezone(userTimezone);
        const today = getTodayInTimezone(userTimezone);

        const workStart = parseInt(profile.work_hours_start?.split(":")?.[0] || "9", 10);
        const workEnd = parseInt(profile.work_hours_end?.split(":")?.[0] || "17", 10);
        const isWorkHours = currentHour >= workStart && currentHour < workEnd;

        if (!isWorkHours) {
          continue;
        }

        usersProcessed++;

        const { data: activeTasks, error: activeTasksError } = await supabase
          .from("tasks")
          .select("id, title, due_date, priority, status")
          .eq("user_id", profile.id)
          .in("status", ["not_started", "in_progress"])
          .not("due_date", "is", null);

        if (activeTasksError) {
          console.error(`Error fetching tasks for user ${profile.id}:`, activeTasksError);
          continue;
        }

        const datedTasks = (activeTasks || []).filter((t) => t.due_date);

        const overdueTasks = datedTasks
          .filter((t) => {
            const dueLocalDay = new Intl.DateTimeFormat("en-CA", { timeZone: userTimezone }).format(new Date(t.due_date!));
            return dueLocalDay < today;
          })
          .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
          .slice(0, 3);

        const todayTasks = datedTasks
          .filter((t) => {
            const dueLocalDay = new Intl.DateTimeFormat("en-CA", { timeZone: userTimezone }).format(new Date(t.due_date!));
            return dueLocalDay === today;
          })
          .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
          .slice(0, 5);

        if (overdueTasks.length > 0) {
          const { error: pushError } = await supabase.functions.invoke("send-push-notification", {
            body: {
              userId: profile.id,
              title: `⚠️ ${overdueTasks.length} Overdue Task${overdueTasks.length > 1 ? "s" : ""}`,
              body:
                overdueTasks.length === 1
                  ? `"${overdueTasks[0].title}" is past due!`
                  : `"${overdueTasks[0].title}" and ${overdueTasks.length - 1} more need attention`,
              data: { type: "overdue-alert", taskIds: overdueTasks.map((t) => t.id) },
              tag: "overdue-tasks",
            },
          });

          if (!pushError) notificationsSent++;
        }

        if (currentHour === workStart && todayTasks.length > 0) {
          const { error: pushError } = await supabase.functions.invoke("send-push-notification", {
            body: {
              userId: profile.id,
              title: `📋 ${todayTasks.length} Task${todayTasks.length > 1 ? "s" : ""} Today`,
              body: todayTasks.length === 1 ? `Don't forget: "${todayTasks[0].title}"` : `Starting with: "${todayTasks[0].title}"`,
              data: { type: "daily-summary", taskIds: todayTasks.map((t) => t.id) },
              tag: "daily-summary",
            },
          });

          if (!pushError) notificationsSent++;
        }

        const frequency = profile.check_in_frequency || 4;
        const shouldCheckIn = currentHour % frequency === 0 && currentHour !== workStart;

        if (shouldCheckIn) {
          const { error: pushError } = await supabase.functions.invoke("send-push-notification", {
            body: {
              userId: profile.id,
              title: "🎯 Quick Check-in",
              body: "How's your productivity? Take a moment to reflect.",
              data: { type: "check-in" },
              tag: "check-in",
            },
          });

          if (!pushError) notificationsSent++;
        }
      } catch (userError) {
        console.error(`Error processing user ${profile.id}:`, userError);
      }
    }

    return new Response(
      JSON.stringify({
        message: "Scheduled notifications processed",
        usersProcessed,
        notificationsSent,
        timestamp: now.toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Error in scheduled-notifications:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
