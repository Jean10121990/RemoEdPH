const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Siguraduhing nababasa ang JSON body sa route na ito
router.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post('/api/admin/marketing/ai-generate', async (req, res) => {
  try {
    // Maglagay ng default empty object {} para maiwasan ang destructuring error
    const { contentType, targetMarket, topicDetails } = req.body || {};

    if (!topicDetails) {
      return res.status(400).json({
        success: false,
        message: 'Topic details are required.'
      });
    }

    const systemInstruction = `You are an expert ESL Marketing Specialist for RemoEdPH, a premier online English learning platform for children aged 3-6 in Taiwan, Japan, South Korea, and Southeast Asia. 
Your tone is warm, professional, encouraging, and highly converting for parents. 
RemoEdPH features interactive AI character-led lessons with characters Remo the Robot, Ed, and Sophia.`;

  const model = genAI.getGenerativeModel({
  model: 'gemini-pro', // Palitan ng gemini-pro
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
    console.error('Error generating AI marketing content:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate content. Please check server logs or API key setup.'
    });
  }
});

module.exports = router;