const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Middleware para masigurong mababasa ang JSON body
router.use(express.json());

// Kunin ang API Key mula sa .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post('/api/admin/marketing/ai-generate', async (req, res) => {
  try {
    const { contentType, targetMarket, topicDetails } = req.body || {};

    if (!topicDetails || !topicDetails.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Topic details are required.'
      });
    }

    const systemInstruction = `You are an expert ESL Marketing Specialist for RemoEdPH, a premier online English learning platform for children aged 3-6 in Taiwan, Japan, South Korea, and Southeast Asia. 
Your tone is warm, professional, encouraging, and highly converting for parents. 
RemoEdPH features interactive AI character-led lessons with characters Remo the Robot, Ed, and Sophia.`;

    // Standard Gemini model name
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: systemInstruction
    });

    const prompt = `
Task: Create ${contentType}
Target Market: ${targetMarket || 'General International (Asia)'}
Context / Topic: ${topicDetails}

Please generate 2 distinct variations of the copy with emojis, clear formatting, engaging hooks, and actionable call-to-action.
`.trim();

    const result = await model.generateContent(prompt);
    const generatedText = result.response.text();

    return res.json({
      success: true,
      content: generatedText
    });

  } catch (error) {
    console.error('Error generating AI marketing content:', error.message || error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate content. Please check server logs or API key setup.'
    });
  }
});

module.exports = router;