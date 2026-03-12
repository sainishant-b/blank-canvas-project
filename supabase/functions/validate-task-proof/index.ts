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
