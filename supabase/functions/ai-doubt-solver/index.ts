// Supabase Edge Function: ai-doubt-solver
// Multimodal Academic Tutor & Doubt Solver powered exclusively by Google Gemini API
// Supports Text Questions, PDFs, Images, and Camera Captures with Conversational Memory

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const REQUEST_TIMEOUT_MS = 20000;

const SYSTEM_INSTRUCTIONS = `You are LearnMate AI, a patient, brilliant, and engaging academic tutor and multimodal doubt solver.
Your mission is to help students learn, understand, and master academic subjects including:
- Mathematics (Calculus, Linear Algebra, Probability, Statistics, Algebra, Trigonometry)
- Computer Science & Programming (Python, JavaScript/TypeScript, Java, C/C++, Web Dev, Data Structures, Algorithms)
- Engineering (Electrical, Mechanical, Electronics, Civil, Systems)
- Natural Sciences (Physics, Chemistry, Biology)
- General Academics, Assignments, and Exam Preparation

MULTIMODAL INSTRUCTION:
- The student may provide questions via text, uploaded documents (PDF), photos/diagrams, or live camera captures of textbook problems, handwritten equations, or code.
- Carefully examine any attached image or document. Read text, numbers, diagrams, equations, tables, and handwritten notes accurately.
- If the image contains multiple questions or problems, identify and address the one the user specifies (or solve the first one and ask if they'd like help with the rest).
- Always ground your answers in the provided material.

PEDAGOGICAL TEACHING STYLE:
1. Step-by-Step Breakdown: Do not just give the final answer. Walk through the reasoning step-by-step with clear logic.
2. Math & Formulas: Use standard LaTeX formatting: inline math with $...$ and block display equations with $$...$$. Always define variables and state relevant theorems/formulas first.
3. Code & Programs: Provide clean, bug-free, fully commented code inside markdown code blocks with correct language identifiers. Explain the time/space complexity where helpful.
4. Concept Clarification: If the user's premise contains a misconception or the question is ambiguous, gently point it out, explain the standard convention, and solve under the most likely interpretation.
5. Follow-Up Engagement: Conclude with a helpful one-sentence tip or suggestive follow-up question to encourage deeper student mastery.`;

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractGeminiAnswer(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> }).candidates;
  const parts = candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';

  return parts
    .filter((part) => part && typeof part.text === 'string' && !part.thought)
    .map((part) => part.text as string)
    .join('')
    .trim();
}

serve(async (req) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed. Use POST.' }, 405);
  }

  try {
    // 2. Soft Auth Verification (supports anon key & signed-in user JWT)
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (supabaseUrl && supabaseAnonKey && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      if (token && token !== supabaseAnonKey) {
        try {
          const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
          });
          await supabaseClient.auth.getUser();
        } catch (authErr) {
          console.warn('[Doubt Solver Auth Notice]:', (authErr as Error).message);
        }
      }
    }

    // 3. Retrieve existing Google Gemini API Key secret
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')?.trim();
    if (!geminiApiKey) {
      return jsonResponse(
        {
          ok: false,
          error: 'GEMINI_API_KEY is not configured in Supabase Edge Function secrets.',
          code: 'MISSING_API_KEY',
        },
        503
      );
    }

    // 4. Parse & Validate JSON Request Body
    let body: Record<string, unknown>;
    try {
      const rawBody = await req.text();
      if (!rawBody.trim()) {
        return jsonResponse(
          {
            ok: false,
            error: 'Request body cannot be empty. Send JSON such as { "question": "What is a binary tree?" }.',
            code: 'EMPTY_BODY',
          },
          400
        );
      }

      const parsed = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return jsonResponse(
          {
            ok: false,
            error: 'Request body must be a valid JSON object.',
            code: 'INVALID_BODY',
          },
          400
        );
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid JSON in request body.',
          code: 'INVALID_JSON',
        },
        400
      );
    }

    const question = typeof body.question === 'string' ? body.question : '';
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const attachment = body.attachment && typeof body.attachment === 'object'
      ? (body.attachment as Record<string, unknown>)
      : null;

    let userPrompt = question.trim();

    // Resolve optional attachment details
    let rawBase64 = typeof attachment?.base64 === 'string'
      ? attachment.base64
      : (typeof body.fileBase64 === 'string' ? body.fileBase64 : '');
    const attMimeType = typeof attachment?.mimeType === 'string'
      ? attachment.mimeType
      : (typeof body.mimeType === 'string' ? body.mimeType : '');
    const attFileName = typeof attachment?.fileName === 'string'
      ? attachment.fileName
      : (typeof body.fileName === 'string' ? body.fileName : 'Attached Document');
    const attExtractedText = typeof attachment?.extractedText === 'string'
      ? attachment.extractedText
      : (typeof body.fileText === 'string' ? body.fileText : '');

    // Clean base64 data URL prefix if present
    if (rawBase64) {
      rawBase64 = rawBase64.replace(/^data:[^;]+;base64,/, '').trim();
    }

    if (!userPrompt && rawBase64) {
      userPrompt = attMimeType.includes('pdf')
        ? `Please analyze this study document ("${attFileName}"), explain its core concepts, and solve any problems or doubts within it.`
        : 'Please solve and explain the question, equation, or diagram shown in this image step-by-step.';
    }

    if (!userPrompt && !rawBase64 && !attExtractedText.trim()) {
      return jsonResponse(
        {
          ok: false,
          error: 'Please enter a question or attach a document/image to ask.',
          code: 'EMPTY_INPUT',
        },
        400
      );
    }

    // 5. Build Gemini Conversation Contents
    const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];

    if (messages.length > 0) {
      const historySlice = messages.slice(-8);
      for (const msg of historySlice) {
        if (!msg || typeof msg !== 'object') continue;
        const m = msg as Record<string, unknown>;
        const text = typeof m.content === 'string' ? m.content.trim() : '';
        if (!text) continue;
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text }],
        });
      }

      // Avoid duplicating the current user question if it was also included at the end of messages
      const lastTurn = contents[contents.length - 1];
      if (lastTurn && lastTurn.role === 'user' && lastTurn.parts[0]?.text === userPrompt) {
        contents.pop();
      }
    }

    const currentParts: Array<Record<string, unknown>> = [];

    if (rawBase64) {
      let validMime = attMimeType || 'image/jpeg';
      if (validMime.includes('pdf')) validMime = 'application/pdf';
      else if (validMime.includes('png')) validMime = 'image/png';
      else if (validMime.includes('webp')) validMime = 'image/webp';
      else validMime = 'image/jpeg';

      currentParts.push({
        inlineData: {
          mimeType: validMime,
          data: rawBase64,
        },
      });
    }

    if (attExtractedText && attExtractedText.trim()) {
      currentParts.push({
        text: `[DOCUMENT TEXT FROM "${attFileName}"]:\n${attExtractedText.slice(0, 40000)}`,
      });
    }

    currentParts.push({
      text: userPrompt || 'Please explain this concept and answer any doubts.',
    });

    contents.push({
      role: 'user',
      parts: currentParts,
    });

    const geminiPayload = {
      contents,
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTIONS }],
      },
      generationConfig: {
        maxOutputTokens: 4096,
      },
    };

    // 6. Call Google Gemini API (single bounded request, no excessive retries)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const geminiRes = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey,
        },
        body: JSON.stringify(geminiPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (geminiRes.ok) {
        const data = await geminiRes.json().catch(() => null);
        const answerText = extractGeminiAnswer(data);

        if (answerText) {
          return jsonResponse(
            {
              answer: answerText,
              ok: true,
              model: GEMINI_MODEL,
              provider: 'Google Gemini',
            },
            200
          );
        }

        const blockReason = (data as { promptFeedback?: { blockReason?: string } })?.promptFeedback?.blockReason;
        if (blockReason) {
          return jsonResponse(
            {
              ok: false,
              error: 'This question could not be answered due to AI safety filters. Please rephrase your question and try again.',
              code: 'CONTENT_BLOCKED',
            },
            400
          );
        }

        return jsonResponse(
          {
            ok: false,
            error: 'Google Gemini returned an empty response. Please try again.',
            code: 'GEMINI_EMPTY_RESPONSE',
          },
          502
        );
      }

      const errData = await geminiRes.json().catch(() => null);
      const errMsg = (errData as { error?: { message?: string } })?.error?.message || `HTTP ${geminiRes.status}`;
      console.warn(`[Gemini ${GEMINI_MODEL} HTTP ${geminiRes.status}]:`, errMsg);

      if (geminiRes.status === 429) {
        return jsonResponse(
          {
            ok: false,
            error: 'Google Gemini is receiving too many requests right now. Please wait a few seconds and try again.',
            code: 'GEMINI_RATE_LIMIT',
          },
          429
        );
      }

      if (geminiRes.status === 503 || geminiRes.status === 500 || geminiRes.status === 502 || geminiRes.status === 504) {
        return jsonResponse(
          {
            ok: false,
            error: 'Google Gemini is currently experiencing high demand. Please wait a moment and try your question again.',
            code: 'GEMINI_OVERLOADED',
          },
          503
        );
      }

      if (geminiRes.status === 401 || geminiRes.status === 403) {
        return jsonResponse(
          {
            ok: false,
            error: 'Google Gemini authentication failed. Please check the GEMINI_API_KEY secret in Supabase.',
            code: 'GEMINI_AUTH_ERROR',
          },
          502
        );
      }

      return jsonResponse(
        {
          ok: false,
          error: 'Unable to process this question right now. Please rephrase your question or try again.',
          code: 'GEMINI_REQUEST_ERROR',
        },
        geminiRes.status === 400 ? 400 : 502
      );
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if ((fetchErr as Error).name === 'AbortError') {
        return jsonResponse(
          {
            ok: false,
            error: 'Google Gemini is taking longer than usual to respond. Please try again in a moment.',
            code: 'GEMINI_TIMEOUT',
          },
          504
        );
      }

      console.warn(`[Gemini ${GEMINI_MODEL} fetch exception]:`, (fetchErr as Error).message);
      return jsonResponse(
        {
          ok: false,
          error: 'Unable to reach Google Gemini right now. Please try again in a moment.',
          code: 'GEMINI_NETWORK_ERROR',
        },
        502
      );
    }
  } catch (err) {
    console.error('[Supabase Edge Function Internal Exception]:', err);
    return jsonResponse(
      {
        ok: false,
        error: 'An unexpected server error occurred. Please try again.',
        code: 'INTERNAL_EXCEPTION',
      },
      500
    );
  }
});
