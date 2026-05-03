const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Generate a multiple-choice quiz from extracted PDF text.
 *
 * @param {string} text            – The raw text extracted from the PDF
 * @param {number} questionCount   – Number of questions to generate (5 | 10 | 20 …)
 * @returns {Array}                – Array of question objects
 */
async function generateQuiz(text, questionCount = 10) {
  // Limit text length to avoid exceeding token limits (~10 000 chars)
  const truncatedText = text.length > 10000 ? text.substring(0, 10000) + '...' : text;

  const prompt = `
You are an academic quiz generator. Based on the study material below, create a multiple-choice quiz.

Requirements:
- Generate exactly ${questionCount} questions
- Each question must have exactly 4 options labelled A, B, C, D
- Indicate the correct letter for each question
- Questions should test understanding, NOT just recall of exact wording
- Vary the difficulty: easy, medium, and hard questions
- Return ONLY valid JSON — no markdown, no extra text

Return a JSON array where each item has this exact shape:
{
  "question": "string",
  "options": { "A": "string", "B": "string", "C": "string", "D": "string" },
  "correct": "A" | "B" | "C" | "D"
}

Study material:
${truncatedText}
`;

  const model = genAI.getGenerativeModel(
    { model: 'gemini-2.5-flash-lite' },
    { apiVersion: 'v1beta' }
  );
  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  // Strip any accidental markdown code fences
  const cleaned = responseText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  let questions;
  try {
    questions = JSON.parse(cleaned);
  } catch {
    // Try to find JSON array in the response
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Gemini returned invalid JSON. Please try again.');
    questions = JSON.parse(match[0]);
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('No questions returned from Gemini. Please try again.');
  }

  // Validate structure
  const validated = questions.slice(0, questionCount).map((q, i) => {
    if (!q.question || !q.options || !q.correct) {
      throw new Error(`Question ${i + 1} has invalid format.`);
    }
    return {
      question: String(q.question),
      options: {
        A: String(q.options.A || ''),
        B: String(q.options.B || ''),
        C: String(q.options.C || ''),
        D: String(q.options.D || '')
      },
      correct: String(q.correct).toUpperCase().charAt(0)
    };
  });

  return validated;
}

/**
 * Generate an adaptive multiple-choice quiz focused on a student's weak topic.
 *
 * @param {string} topicName      – The topic the student is weak in
 * @param {string} moduleName     – The module this topic belongs to
 * @param {number} avgScore       – Student's current average score (0-100)
 * @param {number} attemptCount   – How many times they have attempted this topic
 * @param {number} questionCount  – Number of questions to generate
 * @param {string} [pdfText]      – Optional PDF text for richer context
 */
async function generateAdaptiveQuiz(topicName, moduleName, avgScore, attemptCount, questionCount = 10, pdfText = null) {
  let difficultyGuide;
  if (avgScore < 50) {
    difficultyGuide = 'The student is struggling significantly. Start with foundational definitions and core concepts. Use clear, unambiguous wording. All 10 questions should build understanding from the ground up.';
  } else if (avgScore < 70) {
    difficultyGuide = 'The student has basic awareness but lacks mastery. Include a mix of foundational (40%) and intermediate (60%) questions. Target common misconceptions and typical errors students make on this topic.';
  } else {
    difficultyGuide = 'The student is close to mastery. Challenge them with application-level and edge-case questions (70%) alongside some tricky intermediate ones (30%). Avoid trivial questions.';
  }

  const contextSection = pdfText
    ? `\nAdditional study material for context:\n${pdfText.substring(0, 6000)}\n`
    : '';

  const prompt = `
You are an adaptive academic quiz generator. A student is weak in the following topic and needs targeted practice.

Topic: "${topicName}"
Module: "${moduleName}"
Student's current average score on this topic: ${avgScore}%
Number of previous attempts: ${attemptCount}

Adaptive difficulty instruction:
${difficultyGuide}
${contextSection}
Requirements:
- Generate exactly ${questionCount} questions specifically about "${topicName}"
- Each question must have exactly 4 options labelled A, B, C, D
- Indicate the correct letter for each question
- Add a brief "explanation" field (1-2 sentences) explaining WHY the correct answer is right
- Questions must directly address the weak area — do NOT generate generic or off-topic questions
- Return ONLY valid JSON — no markdown, no extra text

Return a JSON array where each item has this exact shape:
{
  "question": "string",
  "options": { "A": "string", "B": "string", "C": "string", "D": "string" },
  "correct": "A" | "B" | "C" | "D",
  "explanation": "string"
}
`;

  const model = genAI.getGenerativeModel(
    { model: 'gemini-2.5-flash-lite' },
    { apiVersion: 'v1beta' }
  );
  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  const cleaned = responseText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  let questions;
  try {
    questions = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Gemini returned invalid JSON for adaptive quiz.');
    questions = JSON.parse(match[0]);
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('No questions returned from Gemini. Please try again.');
  }

  return questions.slice(0, questionCount).map((q, i) => {
    if (!q.question || !q.options || !q.correct) {
      throw new Error(`Adaptive question ${i + 1} has invalid format.`);
    }
    return {
      question:    String(q.question),
      options: {
        A: String(q.options.A || ''),
        B: String(q.options.B || ''),
        C: String(q.options.C || ''),
        D: String(q.options.D || '')
      },
      correct:     String(q.correct).toUpperCase().charAt(0),
      explanation: String(q.explanation || '')
    };
  });
}

module.exports = { generateQuiz, generateAdaptiveQuiz };

