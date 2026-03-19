# Edge Functions Source Code

All 9 Supabase Edge Functions for deployment. Each goes in `supabase/functions/<name>/index.ts`.

## Required Secrets

| Secret | Used By |
|--------|---------|
| `VOIDAI_API_KEY` | ai-task-assistant, ai-goal-breakdown, ai-calendar-schedule, task-recommendations, validate-task-proof, verify-task-proof |
| `RESEND_API_KEY` | send-email |
| `VAPID_PUBLIC_KEY` | send-push-notification |
| `VAPID_PRIVATE_KEY` | send-push-notification |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | send-push-notification |
| `SUPABASE_URL` | auto-provided |
| `SUPABASE_ANON_KEY` | auto-provided |
| `SUPABASE_SERVICE_ROLE_KEY` | auto-provided |

## config.toml

Add this to your `supabase/config.toml`:

```toml
[functions.send-push-notification]
verify_jwt = false

[functions.task-recommendations]
verify_jwt = false

[functions.send-email]
verify_jwt = false

[functions.scheduled-notifications]
verify_jwt = false

[functions.validate-task-proof]
verify_jwt = false

[functions.verify-task-proof]
verify_jwt = false

[functions.ai-calendar-schedule]
verify_jwt = false

[functions.ai-task-assistant]
verify_jwt = false

[functions.ai-goal-breakdown]
verify_jwt = false
```

---

## 1. `ai-task-assistant/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { taskTitle, taskDescription, taskCategory, taskPriority, conversationHistory } = await req.json();

    if (!taskTitle) {
      return new Response(
        JSON.stringify({ error: "Task title is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const VOIDAI_API_KEY = Deno.env.get("VOIDAI_API_KEY");
    if (!VOIDAI_API_KEY) {
      throw new Error("VOIDAI_API_KEY is not configured");
    }

    const systemPrompt = `You are a productivity assistant that helps break down tasks into actionable subtasks. Given a task, provide:
1. A brief helpful message to the user
2. 3-6 actionable subtasks with estimated durations in minutes
3. A suggested description if the user hasn't provided one
4. A timeline summary explaining the workflow
5. Total estimated time in minutes

Use the provided tool to return structured data. Keep subtask titles concise (under 80 chars). Be practical and specific.`;

    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    } else {
      const userPrompt = `Task: "${taskTitle}"${taskDescription ? `\nDescription: ${taskDescription}` : ""}${taskCategory ? `\nCategory: ${taskCategory}` : ""}${taskPriority ? `\nPriority: ${taskPriority}` : ""}

Please suggest subtasks, a timeline, and a description for this task.`;
      messages.push({ role: "user", content: userPrompt });
    }

    const response = await fetch("https://api.voidai.app/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VOIDAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_task_plan",
              description: "Return a structured task plan with subtasks, description, and timeline.",
              parameters: {
                type: "object",
                properties: {
                  message: { type: "string", description: "A brief helpful message to the user about the plan" },
                  subtasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Short actionable subtask title" },
                        estimated_duration: { type: "number", description: "Estimated duration in minutes" },
                        order: { type: "number", description: "Order of the subtask (1-based)" },
                      },
                      required: ["title", "estimated_duration", "order"],
                      additionalProperties: false,
                    },
                  },
                  suggested_description: { type: "string", description: "A suggested task description if not provided" },
                  timeline_summary: { type: "string", description: "Brief summary of the workflow and timeline" },
                  estimated_total_minutes: { type: "number", description: "Total estimated time in minutes" },
                  needs_clarification: { type: "boolean", description: "Whether more info is needed from the user" },
                },
                required: ["message", "subtasks", "timeline_summary", "estimated_total_minutes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_task_plan" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      throw new Error("No tool call returned from AI");
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-task-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

---

## 2. `ai-goal-breakdown/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, description, successCriteria, targetDate, category } = await req.json();

    if (!title) {
      return new Response(
        JSON.stringify({ error: "Goal title is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const VOIDAI_API_KEY = Deno.env.get("VOIDAI_API_KEY");
    if (!VOIDAI_API_KEY) {
      throw new Error("VOIDAI_API_KEY is not configured");
    }

    const timeline = targetDate
      ? `Target date: ${targetDate}`
      : "No specific deadline";

    const systemPrompt = `You are a productivity coach that breaks goals into achievable milestones and tasks. Given a goal, create a realistic plan with:
1. 2-5 milestones (monthly/quarterly checkpoints)
2. Each milestone has 2-4 specific, actionable tasks
3. Target dates spread evenly across the timeline
4. Keep task titles concise (under 60 chars)
5. Make it feel achievable and inspiring, not overwhelming

Use the provided tool to return structured data.`;

    const userPrompt = `Goal: "${title}"${description ? `\nDescription: ${description}` : ""}${successCriteria ? `\nSuccess criteria: ${successCriteria}` : ""}
Category: ${category || "other"}
${timeline}

Break this goal into realistic milestones and tasks.`;

    const response = await fetch("https://api.voidai.app/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VOIDAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_goal_plan",
              description: "Return a structured goal breakdown with milestones and tasks.",
              parameters: {
                type: "object",
                properties: {
                  message: { type: "string", description: "An encouraging message about the plan" },
                  milestones: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Milestone title" },
                        description: { type: "string", description: "Brief milestone description" },
                        target_date: { type: "string", description: "ISO date string for target date" },
                        tasks: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              title: { type: "string", description: "Task title" },
                              priority: { type: "string", enum: ["high", "medium", "low"] },
                              estimated_duration: { type: "number", description: "Duration in minutes" },
                            },
                            required: ["title", "priority", "estimated_duration"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["title", "description", "tasks"],
                      additionalProperties: false,
                    },
                  },
                  suggested_description: { type: "string", description: "A suggested goal description if none provided" },
                },
                required: ["message", "milestones"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_goal_plan" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let result;
    if (toolCall?.function?.arguments) {
      result = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } else {
      const content = aiData.choices?.[0]?.message?.content;
      if (content) {
        try {
          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
          if (jsonMatch) {
            result = JSON.parse(jsonMatch[1].trim());
          } else {
            throw new Error("Could not extract JSON from content");
          }
        } catch (parseErr) {
          console.error("Failed to parse content as JSON:", content);
          throw new Error("AI did not return structured data");
        }
      } else {
        console.error("AI response:", JSON.stringify(aiData));
        throw new Error("No tool call or content returned from AI");
      }
    }

    if (!result.milestones || !Array.isArray(result.milestones)) {
      throw new Error("Invalid response structure: missing milestones array");
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-goal-breakdown error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

---

## 3. `ai-calendar-schedule/index.ts`

```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const voidaiApiKey = Deno.env.get("VOIDAI_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const { requestType, options } = await req.json();

    if (!["schedule_unscheduled", "reschedule", "batch_plan"].includes(requestType)) {
      throw new Error("Invalid requestType");
    }

    // Fetch user's tasks
    const { data: tasks, error: tasksErr } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["pending", "in_progress"]);

    if (tasksErr) throw new Error(`Failed to fetch tasks: ${tasksErr.message}`);

    // Fetch profile for work hours
    const { data: profile } = await supabase
      .from("profiles")
      .select("work_hours_start, work_hours_end, timezone")
      .eq("id", user.id)
      .single();

    // Fetch recent work sessions for pattern analysis
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: sessions } = await supabase
      .from("work_sessions")
      .select("*")
      .eq("user_id", user.id)
      .gte("started_at", sevenDaysAgo.toISOString())
      .order("started_at", { ascending: false });

    // Build context
    const scheduledTasks = tasks?.filter((t) => t.scheduled_date) || [];
    const unscheduledTasks = tasks?.filter((t) => !t.scheduled_date) || [];

    const workHoursStart = profile?.work_hours_start || "09:00";
    const workHoursEnd = profile?.work_hours_end || "17:00";
    const timezone = profile?.timezone || "UTC";

    const today = new Date().toISOString().split("T")[0];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    const endDateStr = endDate.toISOString().split("T")[0];

    let promptContext = `Today is ${today}. User timezone: ${timezone}.\nWork hours: ${workHoursStart} to ${workHoursEnd}.\n\n`;

    promptContext += `SCHEDULED TASKS (${scheduledTasks.length}):\n`;
    scheduledTasks.forEach((t) => {
      promptContext += `- "${t.title}" | Priority: ${t.priority} | Date: ${t.scheduled_date} | Time: ${t.scheduled_time || "unset"} | Duration: ${t.estimated_duration || "unset"}min | Status: ${t.status}\n`;
    });

    promptContext += `\nUNSCHEDULED TASKS (${unscheduledTasks.length}):\n`;
    unscheduledTasks.forEach((t) => {
      promptContext += `- "${t.title}" (id: ${t.id}) | Priority: ${t.priority} | Due: ${t.due_date || "none"} | Duration: ${t.estimated_duration || "unset"}min | Status: ${t.status}\n`;
    });

    if (sessions && sessions.length > 0) {
      promptContext += `\nRECENT WORK SESSIONS (last 7 days):\n`;
      sessions.slice(0, 10).forEach((s) => {
        promptContext += `- Task: ${s.task_id} | Duration: ${s.duration_minutes || "ongoing"}min | ${s.started_at}\n`;
      });
    }

    let instruction = "";
    switch (requestType) {
      case "schedule_unscheduled":
        instruction = `Find optimal time slots for all unscheduled tasks. Consider priorities, due dates, and existing scheduled tasks to avoid conflicts. Distribute tasks across ${today} to ${endDateStr}.`;
        break;
      case "reschedule":
        instruction = `Optimize the entire schedule. Look for conflicts, poor time allocation, or tasks that could be better placed. Consider priorities, estimated durations, and work-life balance.`;
        break;
      case "batch_plan":
        instruction = `Create a comprehensive plan for the week (${today} to ${endDateStr}). Schedule all unscheduled tasks and optimize existing scheduled ones. Create a balanced, productive weekly plan.`;
        break;
    }

    const geminiResponse = await fetch("https://api.voidai.app/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voidaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a productivity-focused calendar scheduling AI. Analyze the user's tasks your job is to propose optimal scheduling. Use the propose_schedule_changes function to return your proposals. Always provide reasoning for each proposal.`,
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
                        taskId: { type: "string", description: "ID of the task to schedule/reschedule" },
                        taskTitle: { type: "string", description: "Title of the task" },
                        action: {
                          type: "string",
                          enum: ["schedule", "reschedule", "keep"],
                          description: "What action to take",
                        },
                        proposedDate: { type: "string", description: "YYYY-MM-DD format" },
                        proposedTime: { type: "string", description: "HH:MM format (24h)" },
                        reasoning: { type: "string", description: "Why this time slot is optimal" },
                        confidence: {
                          type: "string",
                          enum: ["high", "medium", "low"],
                          description: "Confidence in this proposal",
                        },
                        currentDate: { type: "string", description: "Current scheduled date if rescheduling" },
                        currentTime: { type: "string", description: "Current scheduled time if rescheduling" },
                      },
                      required: ["taskId", "taskTitle", "action", "proposedDate", "proposedTime", "reasoning", "confidence"],
                    },
                  },
                  overallReasoning: { type: "string", description: "Overall strategy explanation" },
                  conflictsDetected: {
                    type: "array",
                    items: { type: "string" },
                    description: "Any scheduling conflicts found",
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

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Gemini API error: ${errText}`);
    }

    const geminiData = await geminiResponse.json();
    const toolCall = geminiData.choices?.[0]?.message?.tool_calls?.[0];

    let result;
    if (toolCall?.function?.arguments) {
      result = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } else {
      result = {
        proposals: [],
        overallReasoning: geminiData.choices?.[0]?.message?.content || "Unable to generate proposals",
        conflictsDetected: [],
      };
    }

    const proposalId = crypto.randomUUID();

    return new Response(
      JSON.stringify({
        success: true,
        id: proposalId,
        proposals: result.proposals,
        overallReasoning: result.overallReasoning,
        conflictsDetected: result.conflictsDetected || [],
        proposalType: requestType,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("ai-calendar-schedule error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

---

## 4. `task-recommendations/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const VOIDAI_API_KEY = Deno.env.get('VOIDAI_API_KEY');
    if (!VOIDAI_API_KEY) {
      throw new Error('VOIDAI_API_KEY is not configured');
    }

    const authHeader =
      req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';

    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const jwt = authHeader.replace(/Bearer\s+/i, '').trim();
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(jwt);

    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Fetching tasks and data for user:', user.id);

    const { data: tasks, error: tasksError } = await supabaseClient
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'completed')
      .order('created_at', { ascending: false });

    if (tasksError) {
      console.error('Error fetching tasks:', tasksError);
      throw tasksError;
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
    }

    const { data: checkIns, error: checkInsError } = await supabaseClient
      .from('check_ins')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (checkInsError) {
      console.error('Error fetching check-ins:', checkInsError);
    }

    console.log('Data fetched:', {
      tasksCount: tasks?.length,
      hasProfile: !!profile,
      checkInsCount: checkIns?.length,
    });

    const context = {
      tasks: tasks?.map(t => ({
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
      recentCheckIns: checkIns?.map(c => ({
        mood: c.mood,
        energy_level: c.energy_level,
        created_at: c.created_at,
      })),
      streak: profile?.current_streak,
    };

    const now = new Date();
    const systemPrompt = `You are an AI productivity assistant specializing in task scheduling optimization.
  
Your goal is to recommend the DAILY TOP 5 tasks with optimal time slots based on:
- Task priority, due dates, and estimated duration
- User's energy patterns (identify peak productivity times from check-in history)
- Historical mood and completion patterns
- Current date/time context

SMART MATCHING RULES:
- Match high-priority/complex tasks with peak energy times
- Schedule quick wins during low energy periods
- Respect work hours preferences (${profile?.work_hours_start} to ${profile?.work_hours_end})
- Balance workload across the day

CRITICAL: In ALL messages and warnings, NEVER include task IDs or UUIDs. Always refer to tasks ONLY by their title. For example, say "Task 'Complete report' is overdue" instead of including any ID.

Always provide:
1. Top 5 task recommendations for TODAY with specific time slots
2. Brief, actionable reasoning for each recommendation (1-2 sentences max)
3. Warnings about: overdue tasks, schedule conflicts, workload concerns (use task titles only, no IDs)
4. Overall insights about the user's schedule and patterns (2-3 key points)`;

    const userPrompt = `Analyze and recommend scheduling for TODAY (${now.toLocaleDateString()}):

USER DATA:
${JSON.stringify(context, null, 2)}

Current time: ${now.toLocaleTimeString()}

Focus on the top 5 most important tasks for today. Consider energy patterns from check-ins, task urgency, and optimal timing.`;

    console.log('Calling Gemini AI...');

    const aiResponse = await fetch('https://api.voidai.app/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VOIDAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'suggest_task_schedule',
              description: 'Provide daily top 5 task recommendations with smart time matching',
              parameters: {
                type: 'object',
                properties: {
                  recommendedTasks: {
                    type: 'array',
                    description: 'Top 5 tasks recommended for today with optimal time slots (max 5 items)',
                    maxItems: 5,
                    items: {
                      type: 'object',
                      properties: {
                        taskId: { type: 'string', description: 'UUID of the task' },
                        title: { type: 'string', description: 'Task title' },
                        suggestedTime: { type: 'string', description: 'Time slot (e.g., "9:00 AM - 11:00 AM")' },
                        suggestedDate: { type: 'string', description: 'Date in YYYY-MM-DD format' },
                        reasoning: { type: 'string', description: 'Brief explanation (1-2 sentences)' },
                        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                        priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                        progress: { type: 'number', description: 'Task progress percentage (0-100)' },
                        status: { type: 'string', description: 'Task status (not_started, in_progress, completed)' }
                      },
                      required: ['taskId', 'title', 'suggestedTime', 'suggestedDate', 'reasoning', 'confidence', 'priority']
                    }
                  },
                  insights: {
                    type: 'array',
                    description: 'Key insights about schedule and patterns (2-3 items)',
                    items: { type: 'string' }
                  },
                  warnings: {
                    type: 'array',
                    description: 'Important warnings about schedule issues. IMPORTANT: Never include task IDs or UUIDs in messages - use task titles only.',
                    items: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: ['overdue', 'conflict', 'overload', 'other'] },
                        message: { type: 'string', description: 'Warning message using task titles only, never include IDs' }
                      },
                      required: ['type', 'message']
                    }
                  }
                },
                required: ['recommendedTasks', 'insights', 'warnings']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'suggest_task_schedule' } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API error: ${aiResponse.status} ${errorText}`);
    }

    const aiResponseData = await aiResponse.json();
    console.log('AI response received:', JSON.stringify(aiResponseData));

    const toolCall = aiResponseData.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'suggest_task_schedule') {
      throw new Error('AI did not provide recommendations');
    }

    const result = JSON.parse(toolCall.function.arguments);
    
    const taskMap = new Map(tasks?.map(t => [t.id, t]) || []);
    if (result.recommendedTasks) {
      result.recommendedTasks = result.recommendedTasks.map((rec: any) => {
        const task = taskMap.get(rec.taskId);
        return {
          ...rec,
          progress: task?.progress ?? 0,
          status: task?.status ?? 'not_started',
        };
      });
    }
    
    console.log('AI Recommendations generated:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in task-recommendations function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

---

## 5. `validate-task-proof/index.ts`

```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const voidaiApiKey = Deno.env.get("VOIDAI_API_KEY");

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { taskId, taskTitle, taskDescription, imageUrl, userId } = await req.json();

    if (!taskId || !imageUrl) {
      return new Response(
        JSON.stringify({ error: "taskId and imageUrl are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the image and convert to base64 for Gemini (chunked to avoid stack overflow)
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error("Failed to fetch uploaded image");
    const imageBuffer = await imageResponse.arrayBuffer();
    const uint8Array = new Uint8Array(imageBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64Image = btoa(binary);
    const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";

    // Call VoidAI
    const geminiResponse = await fetch("https://api.voidai.app/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voidaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are a task completion verifier. Analyze the uploaded image and determine if it proves completion of the given task. Use the verify_task_completion function to return your assessment.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Verify if this image proves completion of the task.\n\nTask Title: ${taskTitle || "Unknown"}\nTask Description: ${taskDescription || "No description provided"}\n\nRate how well this image demonstrates task completion on a scale of 0-10.`,
              },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64Image}` },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "verify_task_completion",
              description: "Verify task completion based on the uploaded image",
              parameters: {
                type: "object",
                properties: {
                  rating: { type: "number", description: "Rating from 0-10" },
                  feedback: { type: "string", description: "Detailed feedback" },
                },
                required: ["rating", "feedback"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "verify_task_completion" } },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`AI API error: ${errText}`);
    }

    const geminiData = await geminiResponse.json();
    const toolCall = geminiData.choices?.[0]?.message?.tool_calls?.[0];

    let verification;
    if (toolCall?.function?.arguments) {
      verification = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } else {
      verification = {
        rating: 5,
        feedback: geminiData.choices?.[0]?.message?.content || "Verification completed",
      };
    }

    verification.rating = Math.max(0, Math.min(10, Math.round(verification.rating)));

    // Store in task_proofs table
    const { error: insertErr } = await serviceClient
      .from("task_proofs")
      .insert({
        user_id: user.id,
        task_id: taskId,
        image_url: imageUrl,
        ai_rating: verification.rating,
        ai_feedback: verification.feedback,
      });

    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

    // Update profile stats
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("total_ai_rating, total_proofs_submitted")
      .eq("id", user.id)
      .single();

    if (profile) {
      await serviceClient
        .from("profiles")
        .update({
          total_ai_rating: (profile.total_ai_rating || 0) + verification.rating,
          total_proofs_submitted: (profile.total_proofs_submitted || 0) + 1,
        })
        .eq("id", user.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        ai_rating: verification.rating,
        ai_feedback: verification.feedback,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("validate-task-proof error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

---

## 6. `verify-task-proof/index.ts`

```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const voidaiApiKey = Deno.env.get("VOIDAI_API_KEY");

    // User client for auth
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    // Service client for storage + DB writes
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const formData = await req.formData();
    const imageFile = formData.get("image") as File;
    const taskId = formData.get("taskId") as string;
    const taskTitle = formData.get("taskTitle") as string;
    const taskDescription = formData.get("taskDescription") as string;

    if (!imageFile || !taskId || !taskTitle) {
      throw new Error("Missing required fields: image, taskId, taskTitle");
    }

    // Upload image to storage
    const timestamp = Date.now();
    const ext = imageFile.name.split(".").pop() || "jpg";
    const filePath = `${user.id}/${taskId}_${timestamp}.${ext}`;

    const arrayBuffer = await imageFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { error: uploadErr } = await serviceClient.storage
      .from("task-proofs")
      .upload(filePath, uint8Array, {
        contentType: imageFile.type,
        upsert: false,
      });

    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    // Convert image to base64 for Gemini vision
    const base64Image = btoa(String.fromCodePoint(...uint8Array));
    const mimeType = imageFile.type || "image/jpeg";

    // Call VoidAI
    const geminiResponse = await fetch("https://api.voidai.app/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voidaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a task completion verifier. Analyze the uploaded image and determine if it proves completion of the given task. Use the verify_task_completion function to return your assessment.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Verify if this image proves completion of the task.\n\nTask Title: ${taskTitle}\nTask Description: ${taskDescription || "No description provided"}\n\nRate how well this image demonstrates task completion on a scale of 0-10. Consider:\n- Is the image relevant to the task? \n- Does it show clear evidence of completion?\n- Is the work quality apparent from the image?`,
              },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64Image}` },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "verify_task_completion",
              description: "Verify task completion based on the uploaded image",
              parameters: {
                type: "object",
                properties: {
                  rating: {
                    type: "number",
                    description: "Rating from 0-10 on how well the image proves task completion",
                  },
                  feedback: {
                    type: "string",
                    description: "Detailed feedback about the verification",
                  },
                  relevance: {
                    type: "string",
                    enum: ["high", "medium", "low", "none"],
                    description: "How relevant the image is to the task",
                  },
                  completeness: {
                    type: "string",
                    enum: ["complete", "partial", "minimal", "unrelated"],
                    description: "Level of task completion shown",
                  },
                },
                required: ["rating", "feedback", "relevance", "completeness"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "verify_task_completion" } },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Gemini API error: ${errText}`);
    }

    const geminiData = await geminiResponse.json();
    const toolCall = geminiData.choices?.[0]?.message?.tool_calls?.[0];

    let verification;
    if (toolCall?.function?.arguments) {
      verification = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } else {
      // Fallback: parse from content
      verification = {
        rating: 5,
        feedback: geminiData.choices?.[0]?.message?.content || "Verification completed",
        relevance: "medium",
        completeness: "partial",
      };
    }

    // Clamp rating
    verification.rating = Math.max(0, Math.min(10, Math.round(verification.rating)));

    // Store verification in DB
    const { data: record, error: insertErr } = await serviceClient
      .from("task_verifications")
      .insert({
        user_id: user.id,
        task_id: taskId,
        task_title: taskTitle,
        task_description: taskDescription || null,
        image_path: filePath,
        ai_rating: verification.rating,
        ai_feedback: verification.feedback,
      })
      .select()
      .single();

    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

    return new Response(
      JSON.stringify({
        success: true,
        verification: {
          id: record.id,
          rating: verification.rating,
          feedback: verification.feedback,
          relevance: verification.relevance,
          completeness: verification.completeness,
          imagePath: filePath,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("verify-task-proof error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

---

## 7. `send-email/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  userId: string;
  type: "test" | "daily_digest" | "overdue_alert" | "weekly_report" | "ai_recommendations";
  customSubject?: string;
  customBody?: string;
}

interface Task {
  id: string;
  title: string;
  priority: string;
  status: string;
  due_date: string | null;
  progress: number;
}

function generateEmailHtml(
  type: string,
  userName: string,
  tasks: Task[],
  appUrl: string
): { subject: string; html: string } {
  const brandColor = "#8B5CF6";
  const headerStyle = `background: linear-gradient(135deg, ${brandColor}, #6D28D9); color: white; padding: 32px; text-align: center;`;
  const buttonStyle = `display: inline-block; background: ${brandColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;`;
  
  const footer = `
    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
      <p>You're receiving this because you enabled email notifications.</p>
      <p><a href="${appUrl}/settings" style="color: ${brandColor};">Manage preferences</a> | <a href="${appUrl}/settings" style="color: ${brandColor};">Unsubscribe</a></p>
    </div>
  `;

  const taskListHtml = tasks.length > 0 
    ? tasks.slice(0, 5).map(task => `
        <div style="padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px;">
          <a href="${appUrl}/task/${task.id}" style="color: #1f2937; text-decoration: none; font-weight: 500;">
            ${task.title}
          </a>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
            Priority: ${task.priority} • Progress: ${task.progress}%
            ${task.due_date ? ` • Due: ${new Date(task.due_date).toLocaleDateString()}` : ''}
          </div>
        </div>
      `).join('')
    : '<p style="color: #6b7280;">No tasks to display.</p>';

  switch (type) {
    case "test":
      return {
        subject: "🎉 Test Email - AI Productivity App",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="${headerStyle}">
              <h1 style="margin: 0; font-size: 24px;">Email Notifications Working! 🚀</h1>
            </div>
            <div style="padding: 32px;">
              <p>Hi ${userName || 'there'}!</p>
              <p>Great news! Your email notifications are set up correctly. You'll now receive:</p>
              <ul style="line-height: 1.8;">
                <li>📊 Daily task digests</li>
                <li>⚠️ Overdue task alerts</li>
                <li>🤖 AI-powered task recommendations</li>
                <li>📈 Weekly progress reports</li>
              </ul>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${appUrl}" style="${buttonStyle}">Open App</a>
              </div>
              ${footer}
            </div>
          </div>
        `,
      };

    case "daily_digest":
      const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed');
      const dueTodayTasks = tasks.filter(t => {
        if (!t.due_date) return false;
        const dueDate = new Date(t.due_date).toDateString();
        return dueDate === new Date().toDateString() && t.status !== 'completed';
      });
      
      return {
        subject: `📋 Your Daily Task Digest - ${new Date().toLocaleDateString()}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="${headerStyle}">
              <h1 style="margin: 0; font-size: 24px;">Good morning, ${userName || 'Productivity Champion'}! ☀️</h1>
              <p style="margin: 8px 0 0 0; opacity: 0.9;">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            </div>
            <div style="padding: 32px;">
              ${overdueTasks.length > 0 ? `
                <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
                  <h3 style="margin: 0 0 8px 0; color: #dc2626;">⚠️ ${overdueTasks.length} Overdue Task${overdueTasks.length > 1 ? 's' : ''}</h3>
                  <p style="margin: 0; color: #7f1d1d;">These need your attention today!</p>
                </div>
              ` : ''}
              
              <h3 style="margin: 0 0 16px 0;">📅 Today's Tasks (${dueTodayTasks.length})</h3>
              ${dueTodayTasks.length > 0 ? dueTodayTasks.map(task => `
                <div style="padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px;">
                  <a href="${appUrl}/task/${task.id}" style="color: #1f2937; text-decoration: none; font-weight: 500;">
                    ${task.title}
                  </a>
                </div>
              `).join('') : '<p style="color: #6b7280;">No tasks due today. Great job staying on top of things! 🎉</p>'}
              
              <div style="text-align: center; margin: 32px 0;">
                <a href="${appUrl}" style="${buttonStyle}">View All Tasks</a>
              </div>
              ${footer}
            </div>
          </div>
        `,
      };

    case "overdue_alert":
      const overdueList = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed');
      return {
        subject: `⚠️ You have ${overdueList.length} overdue task${overdueList.length > 1 ? 's' : ''}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; padding: 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">Tasks Need Your Attention! ⚠️</h1>
            </div>
            <div style="padding: 32px;">
              <p>Hi ${userName || 'there'},</p>
              <p>You have ${overdueList.length} task${overdueList.length > 1 ? 's' : ''} past ${overdueList.length > 1 ? 'their' : 'its'} due date:</p>
              ${overdueList.map(task => `
                <div style="padding: 12px; border: 1px solid #fecaca; background: #fef2f2; border-radius: 8px; margin-bottom: 8px;">
                  <a href="${appUrl}/task/${task.id}" style="color: #dc2626; text-decoration: none; font-weight: 500;">
                    ${task.title}
                  </a>
                  <div style="font-size: 12px; color: #991b1b; margin-top: 4px;">
                    Was due: ${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No date'}
                  </div>
                </div>
              `).join('')}
              <div style="text-align: center; margin: 32px 0;">
                <a href="${appUrl}" style="${buttonStyle}">Take Action Now</a>
              </div>
              ${footer}
            </div>
          </div>
        `,
      };

    case "ai_recommendations":
      return {
        subject: "🤖 Your AI Task Recommendations Are Ready",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="${headerStyle}">
              <h1 style="margin: 0; font-size: 24px;">AI Recommendations 🤖</h1>
              <p style="margin: 8px 0 0 0; opacity: 0.9;">Personalized based on your energy levels</p>
            </div>
            <div style="padding: 32px;">
              <p>Hi ${userName || 'there'}!</p>
              <p>Based on your patterns and current energy, here are today's recommended tasks:</p>
              <h3 style="margin: 24px 0 16px 0;">🎯 Top Tasks for Today</h3>
              ${taskListHtml}
              <div style="text-align: center; margin: 32px 0;">
                <a href="${appUrl}" style="${buttonStyle}">View AI Recommendations</a>
              </div>
              ${footer}
            </div>
          </div>
        `,
      };

    case "weekly_report":
      const completedThisWeek = tasks.filter(t => t.status === 'completed');
      return {
        subject: "📈 Your Weekly Productivity Report",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="${headerStyle}">
              <h1 style="margin: 0; font-size: 24px;">Weekly Report 📈</h1>
              <p style="margin: 8px 0 0 0; opacity: 0.9;">Your productivity summary</p>
            </div>
            <div style="padding: 32px;">
              <p>Hi ${userName || 'there'}! Here's how your week went:</p>
              
              <div style="display: flex; gap: 16px; margin: 24px 0;">
                <div style="flex: 1; background: #f0fdf4; padding: 20px; border-radius: 12px; text-align: center;">
                  <div style="font-size: 32px; font-weight: bold; color: #16a34a;">${completedThisWeek.length}</div>
                  <div style="color: #166534; font-size: 14px;">Tasks Completed</div>
                </div>
                <div style="flex: 1; background: #faf5ff; padding: 20px; border-radius: 12px; text-align: center;">
                  <div style="font-size: 32px; font-weight: bold; color: ${brandColor};">${tasks.length - completedThisWeek.length}</div>
                  <div style="color: #6d28d9; font-size: 14px;">In Progress</div>
                </div>
              </div>
              
              <p>Keep up the great work! 💪</p>
              
              <div style="text-align: center; margin: 32px 0;">
                <a href="${appUrl}/insights" style="${buttonStyle}">View Full Insights</a>
              </div>
              ${footer}
            </div>
          </div>
        `,
      };

    default:
      return {
        subject: "Notification from AI Productivity",
        html: `<p>You have a new notification. <a href="${appUrl}">Open app</a></p>`,
      };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, type, customSubject, customBody }: EmailRequest = await req.json();

    console.log(`Sending ${type} email to user ${userId}`);

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    
    if (userError || !userData?.user?.email) {
      console.error("Error fetching user:", userError);
      return new Response(
        JSON.stringify({ error: "User not found or no email" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userEmail = userData.user.email;
    const userName = userData.user.user_metadata?.name || userData.user.email?.split('@')[0] || '';

    const { data: profile } = await supabase
      .from("profiles")
      .select("email_notifications_enabled, email_frequency, email_recommendations, email_overdue_alerts, email_weekly_reports")
      .eq("id", userId)
      .single();

    if (type !== "test" && profile && !profile.email_notifications_enabled) {
      console.log("Email notifications disabled for user");
      return new Response(
        JSON.stringify({ message: "Email notifications disabled", sent: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile) {
      if (type === "ai_recommendations" && !profile.email_recommendations) {
        return new Response(
          JSON.stringify({ message: "AI recommendation emails disabled", sent: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (type === "overdue_alert" && !profile.email_overdue_alerts) {
        return new Response(
          JSON.stringify({ message: "Overdue alert emails disabled", sent: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (type === "weekly_report" && !profile.email_weekly_reports) {
        return new Response(
          JSON.stringify({ message: "Weekly report emails disabled", sent: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, priority, status, due_date, progress")
      .eq("user_id", userId)
      .neq("status", "completed")
      .order("due_date", { ascending: true })
      .limit(10);

    const appUrl = Deno.env.get("APP_URL") || "https://your-app-url.com";
    
    const { subject, html } = generateEmailHtml(
      type,
      userName,
      tasks || [],
      appUrl
    );

    const finalSubject = customSubject || subject;
    const finalHtml = customBody ? `<div style="font-family: sans-serif;">${customBody}</div>` : html;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AI Productivity <onboarding@resend.dev>",
        to: [userEmail],
        subject: finalSubject,
        html: finalHtml,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Email send failed:", emailData);
      return new Response(
        JSON.stringify({ error: emailData.message || "Failed to send email", sent: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Email sent successfully:", emailData);

    return new Response(
      JSON.stringify({ 
        message: "Email sent successfully",
        sent: true,
        emailId: emailData.id 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

---

## 8. `send-push-notification/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert base64url to Uint8Array
function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - base64Url.length % 4) % 4);
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Convert Uint8Array to base64url
function uint8ArrayToBase64Url(uint8Array: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...uint8Array));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Generate ECDH key pair for encryption
async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
}

// Export public key to raw format
async function exportPublicKey(key: CryptoKey): Promise<Uint8Array> {
  const exported = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(exported);
}

// Import subscriber's public key
async function importSubscriberKey(p256dh: string): Promise<CryptoKey> {
  const keyData = base64UrlToUint8Array(p256dh);
  return await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
}

// Derive shared secret using ECDH
async function deriveSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey): Promise<ArrayBuffer> {
  return await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
}

// HKDF extract and expand
async function hkdf(salt: Uint8Array, ikm: ArrayBuffer, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    salt.length ? (salt.buffer as ArrayBuffer) : new ArrayBuffer(32),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const prk = await crypto.subtle.sign('HMAC', key, ikm);
  
  const prkKey = await crypto.subtle.importKey(
    'raw',
    prk,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const infoWithCounter = new Uint8Array(info.length + 1);
  infoWithCounter.set(info);
  infoWithCounter[info.length] = 1;
  
  const okm = await crypto.subtle.sign('HMAC', prkKey, infoWithCounter);
  return new Uint8Array(okm).slice(0, length);
}

// Encrypt payload using aes128gcm
async function encryptPayload(
  payload: string,
  p256dh: string,
  auth: string
): Promise<{ encrypted: Uint8Array; serverPublicKey: Uint8Array; salt: Uint8Array }> {
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);
  
  const serverKeyPair = await generateECDHKeyPair();
  const serverPublicKey = await exportPublicKey(serverKeyPair.publicKey);
  
  const subscriberPublicKey = await importSubscriberKey(p256dh);
  const sharedSecret = await deriveSharedSecret(serverKeyPair.privateKey, subscriberPublicKey);
  
  const authSecret = base64UrlToUint8Array(auth);
  const clientPublicKey = base64UrlToUint8Array(p256dh);
  
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  const prkInfo = new Uint8Array([
    ...encoder.encode('WebPush: info\0'),
    ...clientPublicKey,
    ...serverPublicKey
  ]);
  const prk = await hkdf(authSecret, sharedSecret, prkInfo, 32);
  
  const cekInfo = encoder.encode('Content-Encoding: aes128gcm\0');
  const nonceInfo = encoder.encode('Content-Encoding: nonce\0');
  
  const contentEncryptionKey = await hkdf(salt, prk.buffer as ArrayBuffer, cekInfo, 16);
  const nonce = await hkdf(salt, prk.buffer as ArrayBuffer, nonceInfo, 12);
  
  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentEncryptionKey.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2;
  
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce.buffer as ArrayBuffer },
    aesKey,
    paddedPayload
  );
  
  const rs = 4096;
  
  const header = new Uint8Array(16 + 4 + 1 + serverPublicKey.length);
  header.set(salt, 0);
  header[16] = (rs >> 24) & 0xff;
  header[17] = (rs >> 16) & 0xff;
  header[18] = (rs >> 8) & 0xff;
  header[19] = rs & 0xff;
  header[20] = serverPublicKey.length;
  header.set(serverPublicKey, 21);
  
  const encrypted = new Uint8Array(header.length + encryptedData.byteLength);
  encrypted.set(header, 0);
  encrypted.set(new Uint8Array(encryptedData), header.length);
  
  return { encrypted, serverPublicKey, salt };
}

// Create VAPID JWT token
async function createVapidJwt(
  audience: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<{ token: string; publicKey: string }> {
  const encoder = new TextEncoder();
  
  const publicKeyBytes = base64UrlToUint8Array(vapidPublicKey);
  const privateKeyBytes = base64UrlToUint8Array(vapidPrivateKey);
  
  let x: string, y: string;
  
  if (publicKeyBytes.length === 65 && publicKeyBytes[0] === 0x04) {
    x = uint8ArrayToBase64Url(publicKeyBytes.slice(1, 33));
    y = uint8ArrayToBase64Url(publicKeyBytes.slice(33, 65));
  } else if (publicKeyBytes.length === 64) {
    x = uint8ArrayToBase64Url(publicKeyBytes.slice(0, 32));
    y = uint8ArrayToBase64Url(publicKeyBytes.slice(32, 64));
  } else {
    throw new Error(`Invalid VAPID public key length: ${publicKeyBytes.length}`);
  }
  
  const d = uint8ArrayToBase64Url(privateKeyBytes);
  
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x,
    y,
    d,
  };
  
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  
  const header = { typ: 'JWT', alg: 'ES256' };
  const headerB64 = uint8ArrayToBase64Url(encoder.encode(JSON.stringify(header)));
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: 'mailto:push@lovable.app'
  };
  const payloadB64 = uint8ArrayToBase64Url(encoder.encode(JSON.stringify(payload)));
  
  const signatureInput = encoder.encode(`${headerB64}.${payloadB64}`);
  const signatureArrayBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    signatureInput
  );
  
  const signatureBytes = new Uint8Array(signatureArrayBuffer);
  const rawSignature = derToRaw(signatureBytes);
  
  const signatureB64 = uint8ArrayToBase64Url(rawSignature);
  
  return {
    token: `${headerB64}.${payloadB64}.${signatureB64}`,
    publicKey: vapidPublicKey
  };
}

// Convert DER encoded ECDSA signature to raw format (R || S)
function derToRaw(der: Uint8Array): Uint8Array {
  if (der.length === 64) {
    return der;
  }
  
  if (der[0] !== 0x30) {
    return der;
  }
  
  let offset = 2;
  
  if (der[offset] !== 0x02) {
    throw new Error('Invalid DER signature format');
  }
  offset++;
  const rLength = der[offset];
  offset++;
  let r = der.slice(offset, offset + rLength);
  offset += rLength;
  
  if (der[offset] !== 0x02) {
    throw new Error('Invalid DER signature format');
  }
  offset++;
  const sLength = der[offset];
  offset++;
  let s = der.slice(offset, offset + sLength);
  
  if (r.length > 32) r = r.slice(r.length - 32);
  if (s.length > 32) s = s.slice(s.length - 32);
  
  const result = new Uint8Array(64);
  result.set(r, 32 - r.length);
  result.set(s, 64 - s.length);
  
  return result;
}

// Create a signed JWT for Google OAuth2 using service account
async function createGoogleJwt(serviceAccount: { client_email: string; private_key: string }): Promise<string> {
  const encoder = new TextEncoder();
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `${unsignedToken}.${sigB64}`;
}

// Get OAuth2 access token from Google
async function getGoogleAccessToken(serviceAccount: { client_email: string; private_key: string }): Promise<string> {
  const jwt = await createGoogleJwt(serviceAccount);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Google access token: ${errorText}`);
  }

  const result = await response.json();
  return result.access_token;
}

// Send FCM V1 push notification
async function sendFcmNotification(
  serviceAccount: { client_email: string; private_key: string; project_id: string },
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const accessToken = await getGoogleAccessToken(serviceAccount);
    
    const stringData: Record<string, string> = {};
    for (const [key, value] of Object.entries(data || {})) {
      stringData[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title,
              body,
            },
            data: stringData,
            android: {
              priority: 'HIGH',
              notification: {
                sound: 'default',
                icon: 'ic_launcher',
                color: '#6366f1',
                channel_id: 'default',
              },
              ttl: '86400s',
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('FCM V1 error response:', errorText);
      return { success: false, error: errorText };
    }

    const result = await response.json();
    console.log('FCM V1 response:', JSON.stringify(result));
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown FCM error';
    return { success: false, error: errorMessage };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const firebaseServiceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_KEY');
    
    let firebaseServiceAccount: { client_email: string; private_key: string; project_id: string } | null = null;
    if (firebaseServiceAccountJson) {
      try {
        firebaseServiceAccount = JSON.parse(firebaseServiceAccountJson);
      } catch (e) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', e);
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { userId, title, body, data, tag } = await req.json();

    console.log(`Sending push notification to user ${userId}: ${title}`);

    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (subError) {
      console.error('Error fetching subscriptions:', subError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch subscriptions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No push subscriptions found for user');
      return new Response(
        JSON.stringify({ message: 'No subscriptions found', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = JSON.stringify({
      title,
      body,
      tag: tag || `notification-${Date.now()}`,
      data: data || {},
      icon: '/favicon.ico',
      badge: '/favicon.ico',
    });

    let webSuccessCount = 0;
    let fcmSuccessCount = 0;
    let failCount = 0;
    const expiredSubscriptions: string[] = [];

    for (const subscription of subscriptions) {
      const isFcm = subscription.endpoint.startsWith('fcm:');
      const isApns = subscription.endpoint.startsWith('apns:');
      
      if (isFcm) {
        if (!firebaseServiceAccount) {
          console.log('FIREBASE_SERVICE_ACCOUNT_KEY not configured, skipping FCM subscription');
          failCount++;
          continue;
        }

        const fcmToken = subscription.endpoint.replace('fcm:', '');
        console.log(`Sending FCM V1 notification to token: ${fcmToken.substring(0, 20)}...`);
        
        const result = await sendFcmNotification(
          firebaseServiceAccount,
          fcmToken,
          title,
          body,
          data || {}
        );

        if (result.success) {
          fcmSuccessCount++;
          console.log(`Successfully sent FCM notification for subscription ${subscription.id}`);
        } else {
          if (result.error?.includes('NotRegistered') || result.error?.includes('InvalidRegistration')) {
            expiredSubscriptions.push(subscription.id);
            console.log(`FCM token expired for subscription ${subscription.id}`);
          } else {
            failCount++;
            console.error(`Failed to send FCM for subscription ${subscription.id}: ${result.error}`);
          }
        }
      } else if (isApns) {
        console.log(`APNs subscription ${subscription.id} - server push not implemented yet`);
        failCount++;
      } else {
        if (!vapidPublicKey || !vapidPrivateKey) {
          console.log('VAPID keys not configured, skipping web push subscription');
          failCount++;
          continue;
        }

        try {
          console.log(`Processing web push subscription ${subscription.id} for endpoint: ${subscription.endpoint.substring(0, 50)}...`);
          
          const endpointUrl = new URL(subscription.endpoint);
          const audience = endpointUrl.origin;
          
          const { encrypted } = await encryptPayload(
            payload,
            subscription.p256dh_key,
            subscription.auth_key
          );
          
          const { token, publicKey } = await createVapidJwt(audience, vapidPublicKey, vapidPrivateKey);
          
          const response = await fetch(subscription.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Encoding': 'aes128gcm',
              'TTL': '86400',
              'Urgency': 'high',
              'Authorization': `vapid t=${token}, k=${publicKey}`,
            },
            body: encrypted.buffer as ArrayBuffer,
          });

          if (response.status === 201 || response.status === 200) {
            webSuccessCount++;
            console.log(`Successfully sent web push to subscription ${subscription.id}`);
          } else if (response.status === 404 || response.status === 410) {
            expiredSubscriptions.push(subscription.id);
            console.log(`Web push subscription ${subscription.id} expired, marking for deletion`);
          } else {
            failCount++;
            const responseText = await response.text();
            console.error(`Failed to send web push to subscription ${subscription.id}: ${response.status} ${responseText}`);
          }
        } catch (err) {
          failCount++;
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error(`Error sending web push to subscription ${subscription.id}:`, errorMessage);
        }
      }
    }

    // Clean up expired subscriptions
    if (expiredSubscriptions.length > 0) {
      const { error: deleteError } = await supabase
        .from('push_subscriptions')
        .delete()
        .in('id', expiredSubscriptions);

      if (deleteError) {
        console.error('Error deleting expired subscriptions:', deleteError);
      } else {
        console.log(`Deleted ${expiredSubscriptions.length} expired subscriptions`);
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'Push notifications processed',
        sent: webSuccessCount + fcmSuccessCount,
        webPush: webSuccessCount,
        fcmPush: fcmSuccessCount,
        failed: failCount,
        expired: expiredSubscriptions.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error in send-push-notification:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

---

## 9. `scheduled-notifications/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getCurrentHourInTimezone(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
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
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return formatter.format(now);
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const now = new Date();
    console.log(`Running scheduled notifications at ${now.toISOString()}`);
    
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, work_hours_start, work_hours_end, check_in_frequency, timezone');
    
    if (profileError) {
      console.error('Error fetching profiles:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profiles' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No profiles found', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let notificationsSent = 0;
    let usersProcessed = 0;

    for (const profile of profiles) {
      try {
        const userTimezone = profile.timezone || 'UTC';
        const currentHour = getCurrentHourInTimezone(userTimezone);
        const today = getTodayInTimezone(userTimezone);

        const workStart = parseInt(profile.work_hours_start?.split(':')[0] || '9');
        const workEnd = parseInt(profile.work_hours_end?.split(':')[0] || '17');
        
        const isWorkHours = currentHour >= workStart && currentHour < workEnd;
        
        if (!isWorkHours) {
          console.log(`Skipping user ${profile.id} - outside work hours (${workStart}-${workEnd}, tz: ${userTimezone}, hour: ${currentHour})`);
          continue;
        }

        usersProcessed++;

        const { data: overdueTasks, error: overdueError } = await supabase
          .from('tasks')
          .select('id, title, due_date, priority')
          .eq('user_id', profile.id)
          .eq('status', 'pending')
          .lt('due_date', today)
          .order('priority', { ascending: false })
          .limit(3);

        if (overdueError) {
          console.error(`Error fetching overdue tasks for user ${profile.id}:`, overdueError);
          continue;
        }

        if (overdueTasks && overdueTasks.length > 0) {
          try {
            const { error: pushError } = await supabase.functions.invoke('send-push-notification', {
              body: {
                userId: profile.id,
                title: `⚠️ ${overdueTasks.length} Overdue Task${overdueTasks.length > 1 ? 's' : ''}`,
                body: overdueTasks.length === 1 
                  ? `"${overdueTasks[0].title}" is past due!`
                  : `"${overdueTasks[0].title}" and ${overdueTasks.length - 1} more need attention`,
                data: { 
                  type: 'overdue-alert',
                  taskIds: overdueTasks.map(t => t.id)
                },
                tag: 'overdue-tasks'
              }
            });

            if (pushError) {
              console.error(`Error sending overdue notification to user ${profile.id}:`, pushError);
            } else {
              notificationsSent++;
              console.log(`Sent overdue notification to user ${profile.id} (${overdueTasks.length} tasks)`);
            }
          } catch (e) {
            console.error(`Exception sending overdue notification to user ${profile.id}:`, e);
          }
        }

        const { data: todayTasks, error: todayError } = await supabase
          .from('tasks')
          .select('id, title, due_date, priority')
          .eq('user_id', profile.id)
          .eq('status', 'pending')
          .eq('due_date', today)
          .order('priority', { ascending: false })
          .limit(5);

        if (todayError) {
          console.error(`Error fetching today's tasks for user ${profile.id}:`, todayError);
          continue;
        }

        if (currentHour === workStart && todayTasks && todayTasks.length > 0) {
          try {
            const { error: pushError } = await supabase.functions.invoke('send-push-notification', {
              body: {
                userId: profile.id,
                title: `📋 ${todayTasks.length} Task${todayTasks.length > 1 ? 's' : ''} Today`,
                body: todayTasks.length === 1 
                  ? `Don't forget: "${todayTasks[0].title}"`
                  : `Starting with: "${todayTasks[0].title}"`,
                data: { 
                  type: 'daily-summary',
                  taskIds: todayTasks.map(t => t.id)
                },
                tag: 'daily-summary'
              }
            });

            if (pushError) {
              console.error(`Error sending daily summary to user ${profile.id}:`, pushError);
            } else {
              notificationsSent++;
              console.log(`Sent daily summary to user ${profile.id}`);
            }
          } catch (e) {
            console.error(`Exception sending daily summary to user ${profile.id}:`, e);
          }
        }

        const frequency = profile.check_in_frequency || 4;
        const shouldCheckIn = currentHour % frequency === 0 && currentHour !== workStart;
        
        if (shouldCheckIn) {
          try {
            const { error: pushError } = await supabase.functions.invoke('send-push-notification', {
              body: {
                userId: profile.id,
                title: '🎯 Quick Check-in',
                body: 'How\'s your productivity? Take a moment to reflect.',
                data: { type: 'check-in' },
                tag: 'check-in'
              }
            });

            if (pushError) {
              console.error(`Error sending check-in to user ${profile.id}:`, pushError);
            } else {
              notificationsSent++;
              console.log(`Sent check-in reminder to user ${profile.id}`);
            }
          } catch (e) {
            console.error(`Exception sending check-in to user ${profile.id}:`, e);
          }
        }

      } catch (userError) {
        console.error(`Error processing user ${profile.id}:`, userError);
      }
    }

    console.log(`Completed: ${usersProcessed} users processed, ${notificationsSent} notifications sent`);

    return new Response(
      JSON.stringify({ 
        message: 'Scheduled notifications processed',
        usersProcessed,
        notificationsSent,
        timestamp: now.toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error in scheduled-notifications:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

---

## Deployment

To deploy all functions to your Supabase project:

```bash
supabase functions deploy ai-task-assistant
supabase functions deploy ai-goal-breakdown
supabase functions deploy ai-calendar-schedule
supabase functions deploy task-recommendations
supabase functions deploy validate-task-proof
supabase functions deploy verify-task-proof
supabase functions deploy send-email
supabase functions deploy send-push-notification
supabase functions deploy scheduled-notifications
```

Set secrets:

```bash
supabase secrets set VOIDAI_API_KEY=your_key
supabase secrets set RESEND_API_KEY=your_key
supabase secrets set VAPID_PUBLIC_KEY=your_key
supabase secrets set VAPID_PRIVATE_KEY=your_key
supabase secrets set FIREBASE_SERVICE_ACCOUNT_KEY='{"client_email":"...","private_key":"...","project_id":"..."}'
```
