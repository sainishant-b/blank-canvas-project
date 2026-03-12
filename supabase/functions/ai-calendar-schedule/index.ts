import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const extractJsonFromContent = (content: string) => {
  const jsonMatch =
    content.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    content.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) throw new Error("Could not extract JSON from content");
  return JSON.parse(jsonMatch[1].trim());
};

const extractToolResult = (aiData: any, toolName: string) => {
  const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];

  if (toolCall?.function?.name === toolName && toolCall?.function?.arguments) {
    return typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;
  }

  const content = aiData?.choices?.[0]?.message?.content;
  if (!content) throw new Error("No tool call or content returned from AI");
  return extractJsonFromContent(content);
};

const normalizeTime24h = (input: string | undefined, fallback = "09:00") => {
  if (!input || typeof input !== "string") return fallback;
  const clean = input.trim();

  if (/^\d{2}:\d{2}$/.test(clean)) return clean;

  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!ampmMatch) return fallback;

  let hour = Number(ampmMatch[1]);
  const minute = ampmMatch[2];
  const ampm = ampmMatch[3].toUpperCase();

  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${minute}`;
};

const toDateTimeParts = (iso: string | null | undefined) => {
  if (!iso) return { date: null as string | null, time: null as string | null };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: null, time: null };

  return {
    date: d.toISOString().split("T")[0],
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });

    const jwt = authHeader.replace(/Bearer\s+/i, "").trim();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { requestType, options } = await req.json();
    if (!["schedule_unscheduled", "reschedule", "batch_plan"].includes(requestType)) {
      return new Response(JSON.stringify({ error: "Invalid requestType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tasks, error: tasksErr } = await supabase
      .from("tasks")
      .select("id, title, due_date, priority, status, estimated_duration, category")
      .eq("user_id", user.id)
      .neq("status", "completed");

    if (tasksErr) throw new Error(`Failed to fetch tasks: ${tasksErr.message}`);

    const { data: profile } = await supabase
      .from("profiles")
      .select("work_hours_start, work_hours_end, timezone")
      .eq("id", user.id)
      .maybeSingle();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: sessions } = await supabase
      .from("work_sessions")
      .select("task_id, time_spent, created_at")
      .eq("user_id", user.id)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(20);

    const allTasks = tasks || [];
    const scheduledTasks = allTasks.filter((t) => !!t.due_date);
    const unscheduledTasks = allTasks.filter((t) => !t.due_date);

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 7);
    const endDateStr = endDate.toISOString().split("T")[0];

    const workHoursStart = profile?.work_hours_start || "09:00:00";
    const workHoursEnd = profile?.work_hours_end || "18:00:00";
    const timezone = profile?.timezone || "UTC";

    let promptContext = `Today is ${today}. User timezone: ${timezone}.\nWork hours: ${workHoursStart} to ${workHoursEnd}.\n\n`;

    promptContext += `SCHEDULED TASKS (${scheduledTasks.length}):\n`;
    for (const t of scheduledTasks) {
      const parts = toDateTimeParts(t.due_date);
      promptContext += `- \"${t.title}\" | Priority: ${t.priority} | Date: ${parts.date || "unset"} | Time: ${parts.time || "unset"} | Duration: ${t.estimated_duration || "unset"}min | Status: ${t.status}\n`;
    }

    promptContext += `\nUNSCHEDULED TASKS (${unscheduledTasks.length}):\n`;
    for (const t of unscheduledTasks) {
      promptContext += `- \"${t.title}\" (id: ${t.id}) | Priority: ${t.priority} | Duration: ${t.estimated_duration || "unset"}min | Status: ${t.status}\n`;
    }

    if (sessions && sessions.length > 0) {
      promptContext += "\nRECENT WORK SESSIONS (last 7 days):\n";
      for (const s of sessions.slice(0, 10)) {
        promptContext += `- Task: ${s.task_id || "unknown"} | Duration: ${s.time_spent ?? "unknown"}min | ${s.created_at}\n`;
      }
    }

    let instruction = "";
    switch (requestType) {
      case "schedule_unscheduled":
        instruction = `Find optimal time slots for unscheduled tasks. Distribute across ${today} to ${endDateStr} and avoid conflicts.`;
        break;
      case "reschedule":
        instruction = "Optimize existing schedule for better focus and balance while preserving priorities.";
        break;
      case "batch_plan":
        instruction = `Create a full weekly plan (${today} to ${endDateStr}) combining unscheduled tasks and improvements to already scheduled tasks.`;
        break;
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a productivity-focused calendar scheduling AI. Propose practical, realistic scheduling changes. Use the propose_schedule_changes function. Keep reasoning concise and clear.",
          },
          {
            role: "user",
            content: `${promptContext}\n\nINSTRUCTION: ${instruction}${options?.focusArea ? "\nFocus area: " + options.focusArea : ""}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "propose_schedule_changes",
              description: "Propose scheduling changes for the user's tasks",
              parameters: {
                type: "object",
                properties: {
                  proposals: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        taskId: { type: "string" },
                        taskTitle: { type: "string" },
                        action: { type: "string", enum: ["schedule", "reschedule", "keep"] },
                        proposedDate: { type: "string", description: "YYYY-MM-DD format" },
                        proposedTime: { type: "string", description: "HH:MM format (24h preferred)" },
                        reasoning: { type: "string" },
                        confidence: { type: "string", enum: ["high", "medium", "low"] },
                        currentDate: { type: "string" },
                        currentTime: { type: "string" },
                      },
                      required: ["taskId", "taskTitle", "action", "proposedDate", "proposedTime", "reasoning", "confidence"],
                    },
                  },
                  overallReasoning: { type: "string" },
                  conflictsDetected: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["proposals", "overallReasoning"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "propose_schedule_changes" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const errText = await aiResponse.text();
      throw new Error(`AI API error: ${aiResponse.status} ${errText}`);
    }

    const aiData = await aiResponse.json();
    const raw = extractToolResult(aiData, "propose_schedule_changes");

    const taskMap = new Map((tasks || []).map((t) => [t.id, t]));

    const normalizedProposals = (Array.isArray(raw?.proposals) ? raw.proposals : [])
      .map((p: any) => {
        const byId = typeof p?.taskId === "string" ? taskMap.get(p.taskId) : undefined;
        const byTitle = !byId && typeof p?.taskTitle === "string"
          ? (tasks || []).find((t) => t.title.toLowerCase() === p.taskTitle.toLowerCase())
          : undefined;

        const task = byId || byTitle;
        if (!task) return null;

        const currentParts = toDateTimeParts(task.due_date);
        const proposedDate = typeof p?.proposedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.proposedDate)
          ? p.proposedDate
          : currentParts.date || today;

        const proposedTime = normalizeTime24h(
          typeof p?.proposedTime === "string" ? p.proposedTime : undefined,
          currentParts.time || workHoursStart.slice(0, 5)
        );

        const confidence = ["high", "medium", "low"].includes(p?.confidence) ? p.confidence : "medium";
        const action = ["schedule", "reschedule", "keep"].includes(p?.action) ? p.action : "keep";

        return {
          taskId: task.id,
          taskTitle: task.title,
          action,
          proposedDate,
          proposedTime,
          reasoning: typeof p?.reasoning === "string" ? p.reasoning : "Suggested slot based on workload and priority.",
          confidence,
          currentDate: currentParts.date,
          currentTime: currentParts.time,
        };
      })
      .filter(Boolean);

    const result = {
      success: true,
      id: crypto.randomUUID(),
      proposals: normalizedProposals,
      overallReasoning:
        typeof raw?.overallReasoning === "string"
          ? raw.overallReasoning
          : "Balanced schedule generated from priority, due dates, and work patterns.",
      conflictsDetected: Array.isArray(raw?.conflictsDetected) ? raw.conflictsDetected : [],
      proposalType: requestType,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ai-calendar-schedule error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
