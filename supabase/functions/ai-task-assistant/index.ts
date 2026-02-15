import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { taskTitle, taskDescription, taskCategory, taskPriority, conversationHistory } = await req.json();

    if (!taskTitle?.trim()) {
      return new Response(
        JSON.stringify({ error: "Task title is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a smart productivity assistant that helps users break down tasks into actionable subtasks and plan timelines.

RULES:
1. When the user provides a task, suggest 3-6 practical, actionable subtasks.
2. For each subtask, estimate a realistic duration in minutes.
3. Suggest an overall timeline with a recommended order for completing subtasks.
4. Be conversational and helpful. If the user asks follow-up questions or wants changes, adapt.
5. Keep subtask titles concise (under 60 characters).
6. Consider the task's category and priority when making suggestions.
7. If a task is vague, ask clarifying questions before suggesting subtasks.
8. Also suggest a short, helpful description for the main task if the user hasn't provided one.

RESPONSE FORMAT:
Always respond using the suggest_task_breakdown tool. Include:
- subtasks: array of suggested subtasks with title, estimated_duration (minutes), and order
- suggested_description: a helpful description for the main task (only if user hasn't provided one)
- timeline_summary: a brief text summary of the recommended timeline
- estimated_total_minutes: total estimated time for all subtasks
- message: your conversational response to the user
- needs_clarification: true if you need more info before giving good suggestions`;

    const messages = [
      { role: "system", content: systemPrompt },
    ];

    // Add conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    } else {
      // Initial request
      let userMessage = `Help me break down this task into subtasks and suggest a timeline:\n\nTask: "${taskTitle}"`;
      if (taskDescription) {
        userMessage += `\nDescription: "${taskDescription}"`;
      }
      if (taskCategory) {
        userMessage += `\nCategory: ${taskCategory}`;
      }
      if (taskPriority) {
        userMessage += `\nPriority: ${taskPriority}`;
      }
      messages.push({ role: "user", content: userMessage });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-preview",
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_task_breakdown",
              description: "Suggest subtasks and timeline for a task",
              parameters: {
                type: "object",
                properties: {
                  subtasks: {
                    type: "array",
                    description: "Suggested subtasks in recommended order",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Subtask title (concise, actionable)" },
                        estimated_duration: { type: "number", description: "Estimated minutes to complete" },
                        order: { type: "number", description: "Recommended order (1-based)" },
                      },
                      required: ["title", "estimated_duration", "order"],
                    },
                  },
                  suggested_description: {
                    type: "string",
                    description: "A helpful description for the main task (skip if user already has one)",
                  },
                  timeline_summary: {
                    type: "string",
                    description: "Brief timeline recommendation (e.g., 'Complete over 2 days, starting with research')",
                  },
                  estimated_total_minutes: {
                    type: "number",
                    description: "Total estimated minutes for all subtasks",
                  },
                  message: {
                    type: "string",
                    description: "Your conversational response to the user",
                  },
                  needs_clarification: {
                    type: "boolean",
                    description: "True if you need more information before making good suggestions",
                  },
                },
                required: ["message"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_task_breakdown" } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== "suggest_task_breakdown") {
      throw new Error("AI did not provide task breakdown");
    }

    const result = JSON.parse(toolCall.function.arguments);
    console.log("AI task breakdown:", JSON.stringify(result));

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in ai-task-assistant:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
