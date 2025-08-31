import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.post("/api/analyze-content", async (req, res) => {
  try {
    const text = (req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "No text content provided" });

    const prompt = `
Analyze the following content and respond with STRICT JSON ONLY:

TEXT:
${text}

Return a JSON object with keys exactly:
{
  "hashtags": ["up to 10 relevant hashtags WITHOUT # prefix"],
  "caption": "one engaging caption (<= 260 chars)",
  "tips": ["3-6 actionable engagement tips"]
}
`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();

    // Try to parse JSON; if model wrapped in ```json code fences, strip them
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "");
    let obj;
    try {
      obj = JSON.parse(cleaned);
    } catch {
      // very robust fallback: extract lists heuristically
      obj = {
        hashtags: (cleaned.match(/[#]?\w+/g) || [])
          .filter(w => !/\d+\./.test(w))
          .slice(0, 10)
          .map(w => w.replace(/^#/, "")),
        caption: cleaned.split("\n").find(l => l.length > 30)?.slice(0, 260)
          || "Here’s a concise, punchy caption crafted for engagement.",
        tips: cleaned.split("\n").filter(l => /^\d+\.|[-•]/.test(l)).map(l => l.replace(/^\d+\.\s*|^[-•]\s*/, "")).slice(0, 6)
          || ["Ask a question to spark comments", "Post at your audience’s peak hours", "Use 5–8 specific hashtags"]
      };
    }

    const suggestions = {
      hashtags: Array.isArray(obj.hashtags) ? obj.hashtags.slice(0, 10).map(t => `#${String(t).replace(/^#/, "")}`) : [],
      caption: String(obj.caption || "").slice(0, 260),
      tips: Array.isArray(obj.tips) ? obj.tips.slice(0, 6).map(String) : []
    };

    return res.json({ suggestions });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to analyze content" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
