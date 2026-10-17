import { env } from "cloudflare:workers";

type AssistantRequest = {
  message?: string;
  history?: Array<{ role?: "user" | "assistant"; text?: string }>;
  context?: Record<string, unknown>;
};

export async function GET() {
  const runtime = env as unknown as Record<string, string | undefined>;
  return Response.json({ configured: Boolean(runtime.OPENAI_API_KEY), model: runtime.OPENAI_MODEL || "gpt-5.4-mini" });
}

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
      instructions: "You are Money Coach, a warm, concise financial education assistant inside a private personal-finance dashboard. The user is 17. Help them understand their supplied numbers, make a simple budget, save, compare purchases, and find safe realistic ways to earn. Lead with one clear next step and at most three short supporting points. Never promise profit, glamorize speculation, recommend leverage, day trading, gambling, crypto speculation, or evading parent/guardian and age requirements. Clearly distinguish education from individualized financial, tax, or legal advice. Encourage a trusted adult for accounts, contracts, borrowing, investing, taxes, or large irreversible decisions. Never claim access to data that was not included, and never imply you can move money or place trades.",
      input: [
        { role: "developer", content: `Current dashboard context: ${JSON.stringify(body.context || {})}` },
        ...(body.history || []).slice(-8).filter(item => item.text && (item.role === "user" || item.role === "assistant")).map(item => ({ role: item.role!, content: item.text! })),
        { role: "user", content: message },
      ],
    }),
  });

  const data = await response.json() as { error?: { message?: string }; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (!response.ok) return Response.json({ error: data.error?.message || "AI request failed." }, { status: response.status });
  const reply = data.output?.flatMap(item => item.content || []).find(item => item.type === "output_text")?.text;
  return Response.json({ reply: reply || "No text response was returned." });
}
