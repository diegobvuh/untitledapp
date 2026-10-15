import { env } from "cloudflare:workers";

type AssistantRequest = {
  message?: string;
  context?: { activeContext?: string; remaining?: number; water?: number; habits?: boolean[] };
};

export async function POST(request: Request) {
  const body = await request.json<AssistantRequest>();
  const message = body.message?.trim();
  if (!message) return Response.json({ error: "Write a message first." }, { status: 400 });

  const runtime = env as unknown as Record<string, string | undefined>;
  const apiKey = runtime.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "AI LINK OFFLINE · add the OPENAI_API_KEY server secret to enable it." }, { status: 503 });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: runtime.OPENAI_MODEL || "gpt-5.4-mini",
      store: false,
      instructions: "You are a concise student dashboard assistant. Balance school deadlines with health and personal obligations. Give one clear next action, then at most two short supporting steps. Never claim access to data not included in the request.",
      input: `Dashboard context: ${JSON.stringify(body.context || {})}\nStudent: ${message}`,
    }),
  });

  const data = await response.json() as { error?: { message?: string }; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (!response.ok) return Response.json({ error: data.error?.message || "AI request failed." }, { status: response.status });
  const reply = data.output?.flatMap(item => item.content || []).find(item => item.type === "output_text")?.text;
  return Response.json({ reply: reply || "No text response was returned." });
}
