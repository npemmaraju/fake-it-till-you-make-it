/* ═══════════════════════════════════════════
   STATE.JS — Single source of truth
   All global state lives here.
═══════════════════════════════════════════ */

const S = {
  /* ── Session config ── */
  company: '',
  role: '',
  round: 'hr',          // 'hr' | 'resume'
  mode: 'learning',     // 'learning' | 'real'
  jdText: '',
  resumeText: '',
  resumeFile: null,
  resumeUploaded: false,
  showVideo: true,
  apiKey: '',

  /* ── Media ── */
  stream: null,
  audioCtx: null,
  analyser: null,
  camOn: true,
  micOn: true,

  /* ── Interview state ── */
  questions: [],
  qHistory: [],
  currentQ: 0,
  totalQ: 8,
  currentQDepth: 0,     // follow-up depth within current question slot (max 2)
  timerSec: 0,
  timerInt: null,
  waitingAnswer: false,

  /* ── Conversation (Gemini) ── */
  conversationHistory: [],

  /* ── Voice recognition ── */
  recognition: null,
  isListening: false,
  currentTranscript: '',
  answerStartTime: null,      // when user started speaking this answer

  /* ── Speech cadence (cheat detection) ── */
  speechTimestamps: [],       // [{time, charCount}] — interim result timestamps
  lastInterimLength: 0,

  /* ── Adaptive follow-up ── */
  followUpQueue: [],          // injected follow-up questions (take priority over Gemini)

  /* ── Research intel ── */
  researchIntel: '',
  researchDone: false,

  /* ── Body language tracking ── */
  bodyLang: {
    intervalId: null,
    countdownId: null,
    nextScanIn: 0,
    frameCanvas: null,
    readings: [],           // array of analysis objects [{eyeContact, posture, confidence, gestures, verdict, cheatSignal, ts}]
    panelOpen: true,
    noVideoWarned: false,
  },

  /* ── Cheat detection ── */
  cheatFlags: [],             // [{type, detail, questionIndex, timestamp}]
  // types: 'cadence' | 'gaze' | 'ai_text' | 'offscreen'
};

/* ─── Fallback question banks ─── */
const QBank = {
  hr: [
    "Walk me through your background — who are you, and why are you specifically here for this role?",
    "Tell me about the project you're most proud of. What was your specific, individual contribution?",
    "Describe a time you faced a significant conflict with a teammate. What exactly happened and how did you resolve it?",
    "Tell me about your most significant professional failure. What did you actually learn and what changed because of it?",
    "Give me a concrete example of how you've navigated ambiguity at work or in a project.",
    "Why this company specifically — not the industry, not the category — this company, over every other option you have?",
    "Where do you see yourself in 5 years, and how does this role fit into that path?",
    "Do you have any questions for me about the role or team?"
  ],
  resume: [
    "Walk me through the most technically complex project on your resume — architecture, decisions, your specific role.",
    "What would you do entirely differently if you rebuilt that project from scratch today?",
    "Explain every major architecture decision you made. Why those choices over the alternatives?",
    "What's the hardest bug you've ever debugged? Take me through your process from symptom to fix.",
    "Pick any skill listed on your resume and explain it assuming I know CS basics but nothing specific about it.",
    "How did you measure the success of your projects? Show me the numbers.",
    "If I asked your teammates to describe your contribution, would they say exactly what you just told me?",
    "Do you have any questions for me?"
  ]
};
