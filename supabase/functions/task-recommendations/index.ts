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

const sanitizeWarningMessage = (message: string) =>
  message
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, "")
    .replace(/\s+/g, " ")
    .trim();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });

    const jwt = authHeader.replace(/Bearer\s+/i, "").trim();
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(jwt);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tasks, error: tasksError } = await supabaseClient
      .from("tasks")
      .select("id, title, description, priority, status, category, due_date, estimated_duration, progress, created_at")
      .eq("user_id", user.id)
      .neq("status", "completed")
      .order("created_at", { ascending: false });

    if (tasksError) throw tasksError;

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("work_hours_start, work_hours_end, timezone, current_streak")
      .eq("id", user.id)
      .maybeSingle();

    const { data: checkIns } = await supabaseClient
      .from("check_ins")
      .select("mood, energy_level, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const taskList = tasks || [];
    if (taskList.length === 0) {
      return new Response(
        JSON.stringify({
          recommendedTasks: [],
          insights: ["No active tasks found. Add tasks to get tailored daily recommendations."],
          warnings: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const context = {
      tasks: taskList.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        category: t.category,
        due_date: t.due_date,
        estimated_duration: t.estimated_duration,
        progress: t.progress,
      })),
      workHours: {
        start: profile?.work_hours_start,
        end: profile?.work_hours_end,
        timezone: profile?.timezone,
      },
      recentCheckIns: checkIns || [],
      streak: profile?.current_streak,
    };

    const now = new Date();
    const today = now.toISOString().split("T")[0];

    const systemPrompt = `You are an AI productivity assistant specializing in task scheduling optimization.

Your goal is to recommend the DAILY TOP 5 tasks with optimal time slots based on:
- Task priority, due dates, and estimated duration
- User's energy patterns from check-ins
- Current date/time context

SMART MATCHING RULES:
- Match high-priority/complex tasks with peak energy times
- Schedule quick wins during lower-energy periods
- Respect work hours preferences (${profile?.work_hours_start || "09:00"} to ${profile?.work_hours_end || "18:00"})
- Balance workload across the day

CRITICAL: In all warnings/messages, never include task IDs or UUIDs. Use task titles only.

Always provide:
1) Top 5 task recommendations for today with specific time slots
2) Brief actionable reasoning for each recommendation
3) Warnings (overdue/conflict/overload) with task titles only
4) 2-3 overall insights`;

    const userPrompt = `Analyze and recommend scheduling for TODAY (${now.toLocaleDateString()}):\n\n${JSON.stringify(context, null, 2)}\n\nCurrent time: ${now.toLocaleTimeString()}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_task_schedule",
              description: "Provide daily top 5 task recommendations with smart time matching",
              parameters: {
                type: "object",
                properties: {
                  recommendedTasks: {
                    type: "array",
                    maxItems: 5,
                    items: {
                      type: "object",
                      properties: {
                        taskId: { type: "string" },
                        title: { type: "string" },
                        suggestedTime: { type: "string" },
                        suggestedDate: { type: "string" },
                        reasoning: { type: "string" },
                        confidence: { type: "string", enum: ["high", "medium", "low"] },
                        priority: { type: "string", enum: ["high", "medium", "low"] },
                        progress: { type: "number" },
                        status: { type: "string" },
                      },
                      required: ["title", "suggestedTime", "suggestedDate", "reasoning", "confidence", "priority"],
                    },
                  },
                  insights: {
                    type: "array",
                    items: { type: "string" },
                  },
                  warnings: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["overdue", "conflict", "overload", "other"] },
                        message: { type: "string" },
                      },
                      required: ["type", "message"],
                    },
                  },
                },
                required: ["recommendedTasks", "insights", "warnings"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_task_schedule" } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
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
      throw new Error(`AI API error: ${aiResponse.status} ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const rawResult = extractToolResult(aiData, "suggest_task_schedule");

    const taskMap = new Map(taskList.map((t) => [t.id, t]));

    const recommendedTasks = (Array.isArray(rawResult?.recommendedTasks) ? rawResult.recommendedTasks : [])
      .map((rec: any) => {
        const byId = typeof rec?.taskId === "string" ? taskMap.get(rec.taskId) : undefined;
        const byTitle = !byId && typeof rec?.title === "string"
          ? taskList.find((t) => t.title.toLowerCase() === rec.title.toLowerCase())
          : undefined;

        const task = byId || byTitle;
        if (!task) return null;

        return {
          taskId: task.id,
          title: task.title,
          suggestedTime:
            typeof rec?.suggestedTime === "string" && rec.suggestedTime.trim().length > 0
              ? rec.suggestedTime
              : "09:00 AM - 10:00 AM",
          suggestedDate:
            typeof rec?.suggestedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rec.suggestedDate)
              ? rec.suggestedDate
              : today,
          reasoning:
            typeof rec?.reasoning === "string" && rec.reasoning.trim().length > 0
              ? rec.reasoning
              : "Recommended based on priority and due date.",
          confidence: ["high", "medium", "low"].includes(rec?.confidence) ? rec.confidence : "medium",
          priority: ["high", "medium", "low"].includes(rec?.priority) ? rec.priority : (task.priority as "high" | "medium" | "low"),
          progress: task.progress ?? 0,
          status: task.status ?? "not_started",
        };
      })
      .filter(Boolean)
      .slice(0, 5);

    const insights = Array.isArray(rawResult?.insights)
      ? rawResult.insights.filter((i: unknown) => typeof i === "string").slice(0, 3)
      : [];

    const warnings = (Array.isArray(rawResult?.warnings) ? rawResult.warnings : [])
      .map((w: any) => ({
        type: ["overdue", "conflict", "overload", "other"].includes(w?.type) ? w.type : "other",
        message: sanitizeWarningMessage(typeof w?.message === "string" ? w.message : "Potential schedule issue detected."),
      }))
      .filter((w: { message: string }) => w.message.length > 0)
      .slice(0, 5);

    return new Response(
      JSON.stringify({
        recommendedTasks,
        insights,
        warnings,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in task-recommendations function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
