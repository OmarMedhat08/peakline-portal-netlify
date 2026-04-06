const crypto = require("crypto");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN;

  if (!ANTHROPIC_KEY || !NETLIFY_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing API keys" }) };
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
  const fixedSiteName = `pl-${slug}`;

  const prompt = `You are a professional web designer. Create a complete, beautiful, single-file HTML website for a business with these details:

Business Name: ${bizName}
Category: ${category}
City: ${city}, ${state}
Notes/Vibe: ${notes || "Professional and clean"}

Requirements:
- Single HTML file with all CSS and JS inline
- Dark, modern, professional design — NOT generic
- Sections: Hero, About, ${category === "Restaurant" ? "Menu" : "Services"}, Hours & Location, Contact Form
- Mobile responsive
- Smooth scroll animations
- Contact form (non-functional, just UI)
- Footer with "Built by Peakline Web | peaklineweb.com"
- Use Google Fonts (load from CDN)
- Make it look like a real $699 website
- Color scheme: derive from the business type and any notes provided
- NO placeholder text like "Lorem ipsum" — write real sounding content for this specific business
- Include realistic hours, realistic menu items or services, realistic about section
- The site must feel custom-built for THIS specific business
- Keep it clean and complete — no broken JS, no empty sections

Return ONLY the complete HTML file. No explanation, no markdown, no backticks. Just raw HTML starting with <!DOCTYPE html>`;

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
    // Step 1: Check if site already exists, reuse it
    let siteId, siteData;

    const listRes = await fetch(`https://api.netlify.com/api/v1/sites?name=${fixedSiteName}`, {
      headers: { "Authorization": `Bearer ${NETLIFY_TOKEN}` }
    });
    const existingSites = await listRes.json();
    const existing = Array.isArray(existingSites) && existingSites.find(s => s.name === fixedSiteName);

    if (existing) {
      siteId = existing.id;
      siteData = existing;
    } else {
      const createRes = await fetch("https://api.netlify.com/api/v1/sites", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${NETLIFY_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: fixedSiteName,
          custom_domain: `${slug}.trypeakline.com`
        })
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        return { statusCode: 500, body: JSON.stringify({ error: "Site creation failed", detail: err }) };
      }

      siteData = await createRes.json();
      siteId = siteData.id;
    }

    // Step 2: Create deploy with file hash
    const fileHash = crypto.createHash("sha1").update(htmlContent).digest("hex");

    const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NETLIFY_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ files: { "/index.html": fileHash } })
    });

    if (!deployRes.ok) {
      const err = await deployRes.text();
      return { statusCode: 500, body: JSON.stringify({ error: "Deploy init failed", detail: err }) };
    }

    const deployData = await deployRes.json();
    const deployId = deployData.id;

    // Step 3: Upload HTML file
    const uploadRes = await fetch(`https://api.netlify.com/api/v1/deploys/${deployId}/files/index.html`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${NETLIFY_TOKEN}`,
        "Content-Type": "application/octet-stream"
      },
      body: htmlContent
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return { statusCode: 500, body: JSON.stringify({ error: "File upload failed", detail: err }) };
    }

    // Return the custom subdomain URL
    const liveUrl = `${slug}.trypeakline.com`;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, url: liveUrl })
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
