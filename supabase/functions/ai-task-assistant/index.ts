import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  if (!content) {
    throw new Error("No tool call or content returned from AI");
  }

  return extractJsonFromContent(content);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      taskTitle,
      taskDescription,
      taskCategory,
      taskPriority,
      conversationHistory,
    } = await req.json();

    if (!taskTitle) {
      return new Response(
        JSON.stringify({ error: "Task title is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a productivity assistant that helps break down tasks into actionable subtasks. Given a task, provide:
1. A brief helpful message to the user
2. 3-6 actionable subtasks with estimated durations in minutes
3. A suggested description if the user hasn't provided one
4. A timeline summary explaining the workflow
5. Total estimated time in minutes

Use the provided tool to return structured data. Keep subtask titles concise (under 80 chars). Be practical and specific.`;

    const messages: { role: string; content: string }[] = [{ role: "system", content: systemPrompt }];

    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    } else {
      const userPrompt = `Task: "${taskTitle}"${taskDescription ? `\nDescription: ${taskDescription}` : ""}${taskCategory ? `\nCategory: ${taskCategory}` : ""}${taskPriority ? `\nPriority: ${taskPriority}` : ""}

Please suggest subtasks, a timeline, and a description for this task.`;
      messages.push({ role: "user", content: userPrompt });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
    const result = extractToolResult(aiData, "suggest_task_plan");

    if (!Array.isArray(result?.subtasks)) {
      throw new Error("Invalid AI response: subtasks array missing");
    }

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
