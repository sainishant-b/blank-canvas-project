import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();

    if (authErr || !user) throw new Error("Unauthorized");

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { taskId, taskTitle, taskDescription, imageUrl } = await req.json();

    if (!taskId || !imageUrl) {
      return new Response(
        JSON.stringify({ error: "taskId and imageUrl are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: taskRecord, error: taskErr } = await userClient
      .from("tasks")
      .select("id")
      .eq("id", taskId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (taskErr || !taskRecord) {
      return new Response(JSON.stringify({ error: "Task not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error("Failed to fetch uploaded image");

    const imageBuffer = await imageResponse.arrayBuffer();
    const uint8Array = new Uint8Array(imageBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8Array.subarray(i, i + chunkSize));
    }

    const base64Image = btoa(binary);
    const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a task completion verifier. Analyze the uploaded image and determine if it proves completion of the given task. Use the verify_task_completion function.",
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
              description: "Verify task completion based on uploaded image",
              parameters: {
                type: "object",
                properties: {
                  rating: { type: "number", description: "Rating from 0-10" },
                  feedback: { type: "string", description: "Detailed feedback" },
                  relevance: { type: "string", enum: ["high", "medium", "low", "none"] },
                  completeness: { type: "string", enum: ["complete", "partial", "minimal", "unrelated"] },
                },
                required: ["rating", "feedback"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "verify_task_completion" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
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
      throw new Error(`AI API error: ${errText}`);
    }

    const aiData = await aiResponse.json();
    const verification = extractToolResult(aiData, "verify_task_completion");

    verification.rating = Math.max(0, Math.min(10, Math.round(Number(verification.rating) || 0)));
    verification.feedback = typeof verification.feedback === "string" ? verification.feedback : "Verification completed.";

    const { error: insertErr } = await serviceClient.from("task_proofs").insert({
      user_id: user.id,
      task_id: taskId,
      image_url: imageUrl,
      ai_rating: verification.rating,
      ai_feedback: verification.feedback,
    });

    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("total_ai_rating, total_proofs_submitted")
      .eq("id", user.id)
      .maybeSingle();

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
        relevance: verification.relevance || "medium",
        completeness: verification.completeness || "partial",
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
