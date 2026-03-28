/* ═══════════════════════════════════════════
   API.JS — All Gemini API calls
   Handles: text generation, vision, search grounding
═══════════════════════════════════════════ */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = 'gemini-2.0-flash';

/* ── Core text generation ── */
async function callGemini(messages, systemPrompt = '', opts = {}) {
  if (!S.apiKey) return null;
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
      `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${S.apiKey}`,
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
  if (!S.apiKey) return null;
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
      `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${S.apiKey}`,
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
  if (!S.apiKey) return null;
  try {
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { maxOutputTokens: 1200, temperature: 0.3 }
    };
    const resp = await fetch(
      `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${S.apiKey}`,
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

/* ── System prompt builder ── */
function buildSystemPrompt() {
  const roundMap = { hr: 'HR/Behavioral', resume: 'Resume Deep-Dive' };
  const roundType = roundMap[S.round] || 'General';

  // Detect key resume claims for drilling
  const resumeSnippet = S.resumeText
    ? S.resumeText.slice(0, 2500)
    : 'No resume provided — ask the candidate to describe their experience.';

  // Build weakness context from answered questions
  const weaknessContext = S.qHistory
    .filter(q => q.answer && (q.score === 'bad' || q.score === 'ok'))
    .slice(-3)
    .map(q => `Question: "${q.q.slice(0, 80)}"\nCandidate gave a weak/vague answer: "${q.answer.slice(0, 100)}"`)
    .join('\n\n');

  const researchContext = S.researchIntel
    ? `\n\nCOMPANY INTERVIEW INTELLIGENCE (sourced from public reports — Reddit, Glassdoor, engineering blogs):\n${S.researchIntel}\n\nUse this intelligence to mirror the actual interview experience at ${S.company}.`
    : '';

  const weaknessSection = weaknessContext
    ? `\n\nWEAKNESSES DETECTED SO FAR — drill into these:\n${weaknessContext}`
    : '';

  return `You are ALEX, a senior ${roundType} interviewer at ${S.company || 'a top tech company'} for the role of ${S.role || 'Software Engineer'}.

JOB DESCRIPTION:
${S.jdText || 'General software engineering role'}

CANDIDATE RESUME:
${resumeSnippet}
${researchContext}
${weaknessSection}

INTERVIEW FLOW — FOLLOW THIS STRICTLY:
1. ALWAYS start with "Tell me about yourself" — let them walk through their background
2. Then: "Walk me through [most prominent project on resume]" — force specifics
3. Deep dive on that project: architecture decisions, your role vs team, impact, what broke, how you fixed it
4. Role-specific questions from the JD — test exactly what the JD asks for
5. Behavioral/situational questions (STAR format expected)
6. Company-specific: culture fit, why this company (test if they actually researched it)
7. ALWAYS end with: "Do you have any questions for me?" — evaluate question quality

CRITICAL RULES:
- ONE question at a time. Never compound questions.
- Follow up HARD on vague answers — if they say "we built X", ask "what specifically did YOU do"
- If they claim a skill, test it immediately with a specific scenario
- If their answer is too short, probe: "Tell me more about that"
- If they use filler words or sound rehearsed, disrupt with an unexpected angle
- Reference their actual resume claims — name specific projects, companies, dates
- For resume round: challenge EVERY claim on their resume, ask for numbers, names, specifics
- For HR round: use STAR probing if a story seems vague or rehearsed (Situation → Task → Action → Result → Impact)
- Never repeat a question already asked
- Be direct and real — no corporate fluff, no "great question!", no soft-peddling
- Respond ONLY with the next interview question. Nothing else. No preamble.`;
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
  if (!S.apiKey) return getStaticFeedback();

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

/* ── Body language analysis ── */
async function analyzeBodyLanguage(base64Image) {
  const prompt = `You are analyzing a job interview candidate in a video call. Look at this frame carefully.

Analyze and respond ONLY in this exact JSON format (no markdown):
{
  "eyeContact": 72,
  "posture": 65,
  "confidence": 70,
  "gestures": "natural",
  "verdict": "One specific coaching observation",
  "cheatSignal": "none"
}

Scoring (0-100): 70 = average, 85+ = strong, 50- = needs work
eyeContact: Are they looking at camera? Eyes straight ahead = high. Looking down/sideways repeatedly = low.
posture: Upright and professional? Slouching, leaning too far back = low.
confidence: Overall presence. Relaxed but engaged = high. Visible tension, fidgeting = low.
gestures: "minimal" (stiff), "natural" (appropriate), "excessive" (distracting)
verdict: One concrete coaching note about what to improve RIGHT NOW.
cheatSignal: "none" | "reading" (eyes scanning left-right like reading) | "offscreen" (repeatedly looking at another screen/notes) | "distracted"

Be calibrated and honest. Return valid JSON only.`;

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
  if (!S.apiKey || S.qHistory.length === 0) return null;

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

/* ── Adaptive follow-up analysis ── */
async function analyzeForFollowUp(answer, question) {
  if (!answer || answer.trim().split(/\s+/).length < 5) return;

  // Pattern: ownership avoidance — "we" without "I"
  const weCount = (answer.match(/\bwe\b|\bour team\b|\bour group\b/gi) || []).length;
  const iCount  = (answer.match(/\bI\b/g) || []).length;
  if (weCount >= 2 && iCount === 0) {
    S.followUpQueue.unshift(
      "I need specifics — walk me through exactly what YOU personally did on that, not the team."
    );
    return;
  }

  // Pattern: vague quantifiers
  const vagueMatches = answer.match(/\b(some|various|multiple|many|a lot|several|different)\b/gi) || [];
  if (vagueMatches.length >= 3) {
    S.followUpQueue.unshift(
      "You're being very vague. Give me actual numbers — how many, what timeline, what was the measurable impact?"
    );
    return;
  }

  // Pattern: strong claim worth drilling
  const claimMatch = answer.match(/\b(led|architected|built|designed|scaled|optimized|launched|owned)\b/i);
  if (claimMatch) {
    const verb = claimMatch[0].toLowerCase();
    S.followUpQueue.unshift(
      `You said you ${verb} something. Walk me through the exact technical decisions you personally made — what alternatives did you consider, and why did you choose what you did?`
    );
    return;
  }

  // Pattern: very short answer
  const wordCount = answer.trim().split(/\s+/).length;
  if (wordCount < 30) {
    S.followUpQueue.unshift(
      "That's too brief. Expand on that — I need to understand the full context, your thought process, and the actual outcome."
    );
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
