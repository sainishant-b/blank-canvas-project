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

    if (!toolCall) {
      throw new Error("No tool call returned from AI");
    }

    const result = JSON.parse(toolCall.function.arguments);

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
