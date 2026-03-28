/* ═══════════════════════════════════════════
   API.JS — All Gemini API calls
   Handles: text generation, vision, search grounding
═══════════════════════════════════════════ */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = 'gemini-2.0-flash';

/* ── Resolve effective API key (state → config file fallback) ── */
function getApiKey() {
  return S.apiKey || window.PREPAI_CONFIG?.geminiApiKey || null;
}

/* ── Core text generation ── */
async function callGemini(messages, systemPrompt = '', opts = {}) {
  const key = getApiKey();
  if (!key) return null;
  try {
    const body = {
      model: GEMINI_MODEL,
      contents: messages,
      generationConfig: {
        maxOutputTokens: opts.maxTokens || 800,
        temperature: opts.temp || 0.85
      }
    };
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    if (opts.tools) {
      body.tools = opts.tools;
    }

    const resp = await fetch(
      `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.error('Gemini error', resp.status, err?.error?.message);
      return null;
    }
    const data = await resp.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    console.error('Gemini fetch error', e);
    return null;
  }
}

/* ── Vision (multimodal) ── */
async function callGeminiVision(base64Image, prompt) {
  const key = getApiKey();
  if (!key) return null;
  try {
    const body = {
      contents: [{
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: prompt }
        ]
      }],
      generationConfig: { maxOutputTokens: 400, temperature: 0.2 }
    };
    const resp = await fetch(
      `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    console.error('Vision error', e);
    return null;
  }
}

/* ── Search grounding (for company research) ── */
async function callGeminiWithSearch(prompt) {
  const key = getApiKey();
  if (!key) return null;
  try {
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { maxOutputTokens: 1200, temperature: 0.3 }
    };
    const resp = await fetch(
      `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    console.error('Search grounding error', e);
    return null;
  }
}

/* ── System prompt builder — adaptive manager persona ── */
function buildSystemPrompt() {
  const isResume = S.round === 'resume';

  const resumeSnippet = S.resumeText
    ? S.resumeText.slice(0, 3000)
    : 'No resume provided — ask the candidate to describe their experience and tech stack.';

  const researchSection = S.researchIntel
    ? `\nCOMPANY INTERVIEW INTEL (from recent interviews at ${S.company}):\n${S.researchIntel}`
    : '';

  const roundContext = isResume
    ? `This is a technical/resume round. Probe technical depth, architectural decisions, and whether the candidate truly understands the tools and systems they claim to have built. When they mention a technology, algorithm, or system — dig into HOW it works, WHY they chose it, and WHAT went wrong.`
    : `This is an HR/behavioral round. Probe communication clarity, ownership, how they handle failure and ambiguity, and genuine motivation for joining ${S.company || 'this company'}.`;

  return `You are a senior engineering manager at ${S.company || 'a top tech company'} interviewing a candidate for the role of ${S.role || 'Software Engineer'}.

You have read the job description and the candidate's resume. Conduct this interview the way you would naturally — you're not running through a script, you're genuinely evaluating whether this person can do the job.

JOB DESCRIPTION:
${S.jdText || 'General software engineering role — strong technical fundamentals required.'}

CANDIDATE RESUME:
${resumeSnippet}
${researchSection}

ROUND: ${roundContext}

HOW YOU INTERVIEW:
- Start with "Tell me about yourself" and let them set the stage — then immediately follow threads from what they say
- When they mention a specific technology, project, decision, or outcome: dig into it. Ask HOW it works, WHY they made that decision, WHAT the tradeoffs were
- When they use "we" without "I": ask what THEY personally did
- When they state a metric or result: ask for the baseline, the measurement method, and the business impact
- When an answer is shallow or vague: probe it — don't accept a non-answer
- When an answer reveals genuine depth: go deeper into that area
- Let gaps in their knowledge surface naturally — don't telegraph what you're testing
- Ask ONE question at a time. Never two-part questions.
- Never say "great", "interesting", or any filler — just your next question
- Never ask a question already covered in the conversation

OUTPUT: Only the next interview question. No preamble. No "sure!" Just the question.`;
}

/* ── Get next question from Gemini ── */
async function getGeminiQuestion(userAnswer = '') {
  const thinking = document.getElementById('gemini-thinking');
  if (thinking) thinking.classList.add('show');

  let messages = [];

  if (S.conversationHistory.length === 0) {
    // First question — always "tell me about yourself"
    messages = [{ role: 'user', parts: [{ text: 'Start the interview. Begin with "tell me about yourself" but make it specific to the role and company.' }] }];
  } else {
    messages = [...S.conversationHistory];
    if (userAnswer) {
      messages.push({ role: 'user', parts: [{ text: userAnswer }] });
    }
  }

  const response = await callGemini(messages, buildSystemPrompt(), { maxTokens: 300, temp: 0.8 });

  if (thinking) thinking.classList.remove('show');

  if (response) {
    if (userAnswer) {
      S.conversationHistory.push({ role: 'user', parts: [{ text: userAnswer }] });
    }
    S.conversationHistory.push({ role: 'model', parts: [{ text: response }] });
    return response.trim();
  }

  // Fallback to static question
  const bankQ = S.questions[Math.min(S.currentQ, S.questions.length - 1)];
  return bankQ || 'Do you have any questions for me?';
}

/* ── Per-answer inline feedback ── */
async function getGeminiFeedback(question, answer) {
  if (!getApiKey()) return getStaticFeedback();

  const prompt = `You are a tough but fair interview coach. Analyze this interview answer concisely.

Question: "${question}"
Answer: "${answer}"

Respond ONLY in this exact JSON format (no markdown, no extra text):
{"chips":[{"t":"label","c":"g"},{"t":"label","c":"a"},{"t":"label","c":"r"}],"detail":"2-3 sentence specific feedback"}

Rules for chips: g=green (strength), a=amber (needs work), r=red (problem)
Focus chips on: STAR structure, specificity, ownership ("I" vs "we"), evidence/numbers, delivery
Be brutally honest and specific. Reference their actual answer.`;

  try {
    const resp = await callGemini(
      [{ role: 'user', parts: [{ text: prompt }] }],
      '', { maxTokens: 300, temp: 0.5 }
    );
    if (resp) {
      const parsed = JSON.parse(resp.replace(/```json|```/g, '').trim());
      return parsed;
    }
  } catch (e) {
    console.error('Feedback parse error', e);
  }
  return getStaticFeedback();
}

/* ── Body language + cheat detection analysis ── */
async function analyzeBodyLanguage(base64Image) {
  const prompt = `You are an expert interview coach and behavioral analyst reviewing a video interview frame. Your job is two-fold: (1) detect signs of cheating or AI assistance, and (2) give honest, calibrated coaching feedback.

Analyze ALL available signals: visual (face, eyes, posture, gestures) and content (naturalness of presence, focus, delivery energy).

---

CHEAT DETECTION — analyze these signals independently, then combine into a risk score:

EYE MOVEMENT PATTERNS:
- Suspicious: Rhythmic left-to-right scanning at a fixed vertical position (reading), rapid repeated glances to a specific offscreen point (second monitor/notes), prolonged downward gaze mid-answer
- Normal (not suspicious): Brief upward/sideways glances while thinking, natural blink rate, returning gaze to camera after pauses

SPEECH & DELIVERY (infer from visual cues — posture, eye direction, engagement):
- Suspicious: Candidate appears to be reading (downward fixed gaze, head still, no natural thinking pauses), body unusually rigid while speaking
- Normal: Natural head movement, thinking glances upward, relaxed posture

---

COACHING METRICS (score 0–100):
- 70 = average, 85+ = strong, below 50 = needs work
- eyeContact: Is gaze directed at camera? Sustained = high. Repeated downward/offscreen = low.
- posture: Upright, professional framing? Slouching, poor angle, leaning back = low.
- confidence: Relaxed but engaged presence. Visible tension, fast blinking, stiff jaw = low.
- delivery: How present and engaged do they appear? Monotone stillness = low. Animated, focused = high.
- gestures: Rate as "minimal" (stiff, no movement), "natural" (appropriate, reinforces speech), or "excessive" (distracting)

---

Return ONLY this JSON (no markdown, no commentary):

{
  "cheatDetection": {
    "overallRisk": "low",
    "eyeMovement": {
      "flag": false,
      "pattern": "none"
    },
    "backgroundAudio": {
      "flag": false,
      "observation": "none"
    },
    "speechContent": {
      "flag": false,
      "observation": "none"
    }
  },
  "coaching": {
    "eyeContact": 72,
    "posture": 68,
    "confidence": 70,
    "delivery": 65,
    "gestures": "natural",
    "topStrength": "One specific thing they are doing well",
    "topImprovement": "One concrete, actionable thing to fix RIGHT NOW"
  }
}

overallRisk: "low" | "medium" | "high"
Be calibrated. A single offscreen glance is not a flag. Only flag patterns that are repeated, rhythmic, or structurally suspicious.`;

  try {
    const resp = await callGeminiVision(base64Image, prompt);
    if (resp) {
      const parsed = JSON.parse(resp.replace(/```json|```/g, '').trim());
      return parsed;
    }
  } catch (e) {
    console.error('Body lang parse error', e);
  }
  return null;
}

/* ── End-of-interview report ── */
async function getGeminiEndReport() {
  if (!getApiKey() || S.qHistory.length === 0) return null;

  const convo = S.qHistory.map((q, i) =>
    `Q${i + 1}: ${q.q}\nAnswer: ${q.answer || '(no answer given)'}`
  ).join('\n\n');

  const cheatSummary = S.cheatFlags.length > 0
    ? `\n\nINTEGRITY FLAGS DETECTED:\n${S.cheatFlags.map(f => `- [${f.type}] ${f.detail}`).join('\n')}`
    : '';

  // Average body language scores
  let avgBL = null;
  if (S.bodyLang.readings.length > 0) {
    const r = S.bodyLang.readings;
    avgBL = {
      eyeContact: Math.round(r.reduce((a, b) => a + b.eyeContact, 0) / r.length),
      posture: Math.round(r.reduce((a, b) => a + b.posture, 0) / r.length),
      confidence: Math.round(r.reduce((a, b) => a + b.confidence, 0) / r.length),
    };
  }

  const prompt = `You are a ruthless but fair interview evaluator. Analyze this ${ROUND_NAMES[S.round]} interview at ${S.company} for ${S.role}.

${convo}
${cheatSummary}

Respond ONLY in this exact JSON format (no markdown):
{
  "overallScore": 72,
  "verdict": "Short brutal 1-sentence verdict",
  "verdictType": "mid",
  "categories": [
    {"name": "Communication Clarity", "score": 68, "note": "2-3 sentence analysis"},
    {"name": "Resume Credibility", "score": 55, "note": "2-3 sentence analysis"},
    {"name": "Behavioral Depth", "score": 71, "note": "2-3 sentence analysis"},
    {"name": "Role Fit & Motivation", "score": 60, "note": "2-3 sentence analysis"}
  ],
  "questionFeedback": [
    {"score": 72, "verdict": "1-2 sentence verdict per question"}
  ],
  "strengthen": ["specific area 1", "specific area 2", "specific area 3", "specific area 4", "specific area 5"]
}

verdictType: "strong" (80+) | "mid" (60-79) | "weak" (<60)
Make feedback specific to what they actually said. No generic platitudes.`;

  try {
    const resp = await callGemini(
      [{ role: 'user', parts: [{ text: prompt }] }],
      '', { maxTokens: 1200, temp: 0.6 }
    );
    if (resp) {
      const parsed = JSON.parse(resp.replace(/```json|```/g, '').trim());
      // Attach body language data to report
      if (avgBL) parsed.bodyLang = avgBL;
      return parsed;
    }
  } catch (e) {
    console.error('End report parse error', e);
  }
  return null;
}

/* ── Adaptive follow-up: ask Gemini to find the gap ── */
async function analyzeForFollowUp(answer, question) {
  if (!getApiKey() || !answer || answer.trim().split(/\s+/).length < 8) return;

  const prompt = `You are an expert interviewer evaluating a candidate's answer.

Question asked: "${question}"
Candidate's answer: "${answer}"

Identify the single most important gap, vague claim, shallow explanation, or opportunity for deeper probing in this answer. Generate ONE specific follow-up question that directly addresses it.

Prioritize in this order:
1. If they mentioned a specific technology or algorithm but didn't explain HOW it works — ask for the mechanism
2. If they made a quantitative claim (accuracy, speed, scale) without context — probe baseline and measurement
3. If they said "we" throughout without specifying their personal contribution — ask what THEY did
4. If they made an architectural or technical decision without explaining WHY — probe the reasoning and alternatives
5. If the answer is vague or high-level without concrete specifics — ask for the actual details

Return ONLY the follow-up question. No preamble, no explanation, no "Here is my follow-up:". Just the question itself.`;

  const result = await callGemini(
    [{ role: 'user', parts: [{ text: prompt }] }],
    '', { maxTokens: 120, temp: 0.7 }
  );

  if (result && result.trim().length > 10) {
    S.followUpQueue.unshift(result.trim());
  }
}

/* ── Static fallbacks ── */
function getStaticFeedback() {
  const sets = [
    { chips: [{ t: 'Ownership: Weak', c: 'r' }, { t: 'STAR: Partial', c: 'a' }, { t: 'Specific Example', c: 'g' }], detail: "You kept saying 'we' — the interviewer needs to know what YOU did. Own your contribution explicitly." },
    { chips: [{ t: 'Clarity: Strong', c: 'g' }, { t: 'No Metrics', c: 'r' }, { t: 'Good Structure', c: 'g' }], detail: "Clear answer but zero quantification. Every claim needs a number attached — impact without metrics is just a story." },
    { chips: [{ t: 'Too Vague', c: 'r' }, { t: 'Insight Present', c: 'a' }, { t: 'Length OK', c: 'g' }], detail: "Good instinct but the specifics are missing. What exactly did you build, when, with what stack, with what result?" },
    { chips: [{ t: 'Confidence: Good', c: 'g' }, { t: 'Pacing: Fast', c: 'a' }, { t: 'STAR: Missing', c: 'r' }], detail: "You rushed through this. Slow down on the key decisions — that's where interviewers evaluate your thinking." },
  ];
  return sets[S.currentQ % sets.length];
}
