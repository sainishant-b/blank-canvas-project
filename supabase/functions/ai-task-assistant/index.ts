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

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
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
