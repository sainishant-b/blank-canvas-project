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
    const geminiApiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");

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

    // Call Gemini directly
    const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${geminiApiKey}`,
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
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
