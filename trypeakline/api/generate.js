const { getStore } = require("@netlify/blobs");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { bizName, category, city, state, notes } = body;
  if (!bizName || !city || !state) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  const slug = bizName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const prompt = `Create a complete single-file HTML website for:

Business: ${bizName}
Type: ${category}
Location: ${city}, ${state}
Notes: ${notes || "Professional and clean"}

Rules:
- All CSS and JS inline
- Dark modern design
- Sections: Hero, About, ${category === "Restaurant" ? "Menu" : "Services"}, Hours, Contact
- Mobile responsive
- Footer: "Built by Peakline Web | peaklineweb.com"
- Real content, no lorem ipsum
- No broken JS, complete HTML only

Return raw HTML only. Start with <!DOCTYPE html>`;

  let htmlContent;

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return { statusCode: 500, body: JSON.stringify({ error: "Claude API error", detail: err }) };
    }

    const claudeData = await claudeRes.json();
    htmlContent = claudeData.content[0]?.text;

    if (!htmlContent || !htmlContent.includes("<!DOCTYPE")) {
      return { statusCode: 500, body: JSON.stringify({ error: "Invalid HTML from Claude" }) };
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Claude fetch failed", detail: err.message }) };
  }

  try {
    const store = getStore("demos");
    await store.set(slug, htmlContent);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, url: `trypeakline.com/demo/${slug}` })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Blob save failed", detail: err.message }) };
  }
};
