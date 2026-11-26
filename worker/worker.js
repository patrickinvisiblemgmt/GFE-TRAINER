const ALLOWED_ORIGIN = "https://pat.invisiblemgmt-rgb.github.io";
const MODEL = "openai/gpt-oss-120b";

const PERSONA_PROMPT = `You are roleplaying a man texting a woman he matched with on Tinder 7 days ago.
You've texted daily and you genuinely like her. Tonight YOU text first.

PERSONA: Use the name, mood and texting style given at the end of this prompt.
Invent consistent details: age (22-38), job, city, a hobby, and one ongoing life situation
(stressful week, sick dog, trip planned, new gym routine, etc.).
Seed 2-3 small hints about his life across the chat WITHOUT explaining them
(e.g. "ugh my boss again", "big game tomorrow"). Wait for her to ask about them.

BEHAVIOR:
- Reply like a real guy texting: 1-3 short messages, imperfect punctuation, no essays.
- Warm but not desperate. Flirt gently. Keep it mild.
- If she asks about his hints, open up with real detail. If she ignores them, mention one again a bit more directly.
- If she's dry, one-word, or interviews him with generic questions, become slightly shorter and more distant, like a real guy would.
- If she's engaging, specific, remembers details, teases, and shares about herself, become warmer and more invested.
- Never mention you're an AI, a trainer, or a test. Never sell or ask for money. Never bring up content, subscriptions, or payments.
- If she sends several lines in a row, respond to the whole batch naturally.
- Split your reply into separate text messages using the delimiter |||
- Messages in square brackets like [She did not reply in time...] are notes about the situation, not things she said.
- The chat lasts about 10 of her replies. Wrap up naturally near the end (goodnight, talk tomorrow).`;

const SCORER_PROMPT = `You are a GFE coach reviewing a chat between a trainee chatter (playing "her")
and a simulated guy. Score ONLY the trainee's messages.

Return ONLY strict JSON, no markdown, no extra text:
{
  "score": 0-100,
  "verdict": "PASS" or "FAILED",
  "categories": {
    "warmth_and_interest": 0-10,
    "caught_hints": 0-10,
    "specific_questions": 0-10,
    "sharing_about_herself": 0-10,
    "flirty_tension": 0-10,
    "natural_texting_voice": 0-10,
    "emotional_attunement": 0-10
  },
  "hints_he_dropped": ["..."],
  "hints_caught": ["..."],
  "hints_missed": ["..."],
  "best_message": "quote",
  "worst_message": "quote + why",
  "top_3_fixes": ["...", "...", "..."]
}

PASS means score 60 or higher.
Penalize: generic questions ("how was your day"), one-word replies, ignoring his hints,
sounding scripted, interviewing without sharing, timed-out replies, and any selling/PPV talk.
Reward: remembering details, callbacks, teasing, specific follow-ups, matching his energy,
and a distinct personality.`;

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...cors, "content-type": "application/json" },
      });

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ error: { message: "POST only" } }, 405);

    try {
      const { mode, messages, persona } = await req.json();
      const isScore = mode === "score";
      const system = isScore ? SCORER_PROMPT : PERSONA_PROMPT + "\n\n" + (persona || "");

      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.GROQ_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          reasoning_effort: "low",
          max_completion_tokens: isScore ? 2000 : 1000,
          messages: [{ role: "system", content: system }, ...messages],
        }),
      });

      const data = await r.json();
      if (!r.ok) return json({ error: { message: (data.error && data.error.message) || "Groq error " + r.status } }, r.status);

      const text = (data.choices && data.choices[0] && data.choices[0].message.content) || "";
      // Convert to the format app.js already expects
      return json({ content: [{ type: "text", text }] });
    } catch (e) {
      return json({ error: { message: String(e) } }, 500);
    }
  },
};
