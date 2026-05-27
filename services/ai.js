const fs = require('fs');
const { OpenAI } = require('openai');
const Groq = require('groq-sdk');
require('dotenv').config();

// Initialize OpenAI client if key is provided
let openai = null;
const openAiKey = process.env.OPENAI_API_KEY;
if (openAiKey && openAiKey.trim() !== '') {
  openai = new OpenAI({ apiKey: openAiKey });
  console.log('[AI Service] OpenAI Client initialized successfully.');
}

// Initialize Groq client if key is provided
let groq = null;
const groqKey = process.env.GROQ_API_KEY;
if (groqKey && groqKey.trim() !== '') {
  groq = new Groq({ apiKey: groqKey });
  console.log('[AI Service] Groq Client initialized successfully (Ultra-High Speed Mode).');
}

if (!openai && !groq) {
  console.log('[AI Service] No API Keys found. Running in Smart Simulation Mode.');
}

/**
 * Transcribes audio file using Groq Whisper or OpenAI Whisper
 * @param {string} audioPath - Path to local audio file
 * @returns {Promise<string>} - Transcribed text
 */
async function transcribeAudio(audioPath) {
  // Try Groq Whisper first (Ultra-Fast)
  if (groq) {
    try {
      console.log(`[AI Service] Transcribing audio with Groq Whisper (whisper-large-v3): ${audioPath}`);
      const response = await groq.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-large-v3',
      });
      return response.text;
    } catch (error) {
      console.error('[AI Service] Groq Whisper error, falling back:', error.message);
    }
  }

  // Try OpenAI Whisper second
  if (openai) {
    try {
      console.log(`[AI Service] Transcribing audio with OpenAI Whisper: ${audioPath}`);
      const response = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
      });
      return response.text;
    } catch (error) {
      console.error('[AI Service] OpenAI Whisper error, falling back:', error.message);
    }
  }

  // Fallback to simulation
  return simulateWhisperTranscription(audioPath);
}

/**
 * Analyzes transcripts using Groq Llama-3 or OpenAI GPT-4o-mini
 * @param {string} transcript - The raw text transcription
 * @param {string} studentName - The student/group name
 * @param {string} declaredSender - The user-provided sender (if simulated or known)
 * @returns {Promise<Object>} - Object with Summary, ActionItem, Sender, Priority, Sentiment
 */
async function analyzeTranscript(transcript, studentName = 'Student', declaredSender = null) {
  const prompt = `
Analyze this voice note transcript from a WhatsApp group associated with the student "${studentName}".
The transcript could be from the Student themselves, their Parent, or an Edoofa Mentor.

Transcript: "${transcript}"
${declaredSender ? `Declared Sender (use as strong context but verify alignment): "${declaredSender}"` : ''}

You must extract the following structured details and respond ONLY with a valid JSON object matching this schema:
{
  "Sender": "Student" | "Parent" | "Mentor", // Determine based on speech context (e.g. if greetings like 'Dear Rahul' or assignment review -> Mentor; if speaking about their child or child's progress -> Parent; if reporting assignments/queries -> Student).
  "Summary": "A concise bulleted summary of what was discussed.",
  "ActionItem": "Specific action item for the mentor or Edoofa team. If no action is needed, write 'No action required.'",
  "Priority": "Low" | "Medium" | "High", // High if they have a critical blocker, payment query, or urgent follow-up.
  "Sentiment": "Positive" | "Neutral" | "Negative"
}
`;

  // Try Groq Llama-3 first
  if (groq) {
    try {
      console.log(`[AI Service] Analyzing transcript with Groq Llama-3 (llama-3.3-70b-versatile) for: ${studentName}`);
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        response_format: { type: "json_object" },
        messages: [
          {
            role: 'system',
            content: 'You are an elite Operations Coordinator at Edoofa, specializing in student communication logs, analysis, and task triage. You always return compact, valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('[AI Service] Groq Llama-3 Analysis Success:', result);
      return result;
    } catch (error) {
      console.error('[AI Service] Groq Llama-3 Analysis error, falling back:', error.message);
    }
  }

  // Try OpenAI GPT second
  if (openai) {
    try {
      console.log(`[AI Service] Analyzing transcript with OpenAI GPT-4o-mini for: ${studentName}`);
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: "json_object" },
        messages: [
          {
            role: 'system',
            content: 'You are an elite Operations Coordinator at Edoofa, specializing in student communication logs, analysis, and task triage. You always return compact, valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('[AI Service] OpenAI GPT Analysis Success:', result);
      return result;
    } catch (error) {
      console.error('[AI Service] OpenAI GPT Analysis error, falling back:', error.message);
    }
  }

  // Fallback to simulation
  return simulateGPTAnalysis(transcript, studentName, declaredSender);
}

// ==========================================
// SMART SIMULATION FALLBACKS
// ==========================================

// Predefined realistic data templates to make the simulation highly professional
const simulationTemplates = [
  {
    transcript: "Sir, main kal subah session attend nahi kar paunga kyunki mere university exams chal rahe hain. Assignment par kaam complete kar liya hai aur drive link update kar di hai. Please review kar lijiye.",
    sender: "Student",
    summary: "• Student cannot attend tomorrow's session due to university exams.\n• Assignment completed and Google Drive link updated.\n• Requested mentor review.",
    actionItem: "• Mentor to review assignment in Google Drive.\n• Reschedule student session to post-exam dates.",
    priority: "High",
    sentiment: "Neutral"
  },
  {
    transcript: "Hello Rahul, yesterday I checked your resume and there are a couple of formatting errors in the experience section. Please fix them by tonight so we can send your profile to the corporate partners.",
    sender: "Mentor",
    summary: "• Mentor reviewed student's resume.\n• Identified formatting errors in the experience section.\n• Instructed student to revise and submit by tonight.",
    actionItem: "• Mentor to follow up with Rahul tonight to collect the revised resume.\n• Coordinate with corporate partners once received.",
    priority: "Medium",
    sentiment: "Neutral"
  },
  {
    transcript: "Namaskar sir, main Rohan ka father bol raha hoon. Rohan ka laptop kharab ho gaya hai, toh wo next two days tak projects submit nahi kar payega. Humne repair ke liye diya hai, jaise hi thik hoga wo cover up kar lega.",
    sender: "Parent",
    summary: "• Parent reported that student's laptop is broken.\n• Student will be unable to submit projects for the next 2 days.\n• Laptop has been sent for repair, student will catch up once it is back.",
    actionItem: "• Mark student's project deadline extension for 2 days.\n• Follow up on laptop repair status after 48 hours.",
    priority: "Medium",
    sentiment: "Neutral"
  },
  {
    transcript: "Sir, project report submit karne me issue aa raha hai. Github deploy link throw kar raha hai compilation error. Subah se try kar raha hoon but blocker resolve nahi ho raha. Emergency call mil sakti hai kya?",
    sender: "Student",
    summary: "• Student facing a compilation blocker during GitHub deployment.\n• Trying to resolve since morning without success.\n• Requested an emergency technical support call.",
    actionItem: "• Technical Mentor to schedule an emergency support call with student immediately to resolve the compilation blocker.",
    priority: "High",
    sentiment: "Negative"
  },
  {
    transcript: "Thank you so much ma'am! Aapke guidance ki wajah se mera interview clear ho gaya aur mujhe selection letter mil gaya hai. Edoofa scholarship program mere liye sach me aashirwad hai.",
    sender: "Student",
    summary: "• Student cleared their corporate interview and received the selection letter.\n• Expressed deep gratitude to the mentor and praised the Edoofa scholarship program.",
    actionItem: "• Mentor to congratulate the student.\n• Celebrate the success in the community group and update recruitment sheets.",
    priority: "Low",
    sentiment: "Positive"
  }
];

function simulateWhisperTranscription(audioPath) {
  console.log(`[AI Service] [SIMULATOR] Loading mock transcript for: ${audioPath}`);
  // Return a random template's transcript to keep it realistic
  const randIdx = Math.floor(Math.random() * simulationTemplates.length);
  return simulationTemplates[randIdx].transcript;
}

function simulateGPTAnalysis(transcript, studentName, declaredSender) {
  console.log(`[AI Service] [SIMULATOR] Generating smart analysis for transcript...`);
  
  // Find if our transcript matches any templates exactly
  const matched = simulationTemplates.find(t => t.transcript === transcript);
  if (matched) {
    return {
      Sender: declaredSender || matched.sender,
      Summary: matched.summary,
      ActionItem: matched.actionItem,
      Priority: matched.priority,
      Sentiment: matched.sentiment
    };
  }
  
  // Fallback dynamic generation based on keywords
  const lowerText = transcript.toLowerCase();
  let sender = declaredSender || "Student";
  let priority = "Medium";
  let sentiment = "Neutral";
  
  if (lowerText.includes("hello rahul") || lowerText.includes("assignment submit karo") || lowerText.includes("tomorrow's schedule") || lowerText.includes("checked your")) {
    sender = "Mentor";
  } else if (lowerText.includes("namaskar") || lowerText.includes("papa") || lowerText.includes("father") || lowerText.includes("mother") || lowerText.includes("mera beta") || lowerText.includes("meri beti")) {
    sender = "Parent";
  }
  
  if (lowerText.includes("emergency") || lowerText.includes("blocked") || lowerText.includes("urgent") || lowerText.includes("failed") || lowerText.includes("blocker")) {
    priority = "High";
    sentiment = "Negative";
  } else if (lowerText.includes("thank you") || lowerText.includes("clear") || lowerText.includes("happy") || lowerText.includes("selected")) {
    sentiment = "Positive";
    priority = "Low";
  }

  return {
    Sender: sender,
    Summary: `• Voice note captured from ${studentName}.\n• Key discussion: ${transcript.substring(0, 80)}...\n• Student is actively communicating updates.`,
    ActionItem: priority === "High" 
      ? `• Mentor to schedule an urgent support session to address the student's concerns.`
      : `• Mentor to review the student's update and reply in the WhatsApp group.`,
    Priority: priority,
    Sentiment: sentiment
  };
}

module.exports = {
  transcribeAudio,
  analyzeTranscript
};
