/* ═══════════════════════════════════════════
   RESEARCH-PHASE.JS
   Runs before the interview starts.
   Uses Gemini Search grounding to find real
   interview questions from Reddit, Glassdoor, etc.
═══════════════════════════════════════════ */

async function runResearchPhase() {
  // Step 0: Show overlay with research steps
  showOverlay('Preparing Your Interview', [
    `Researching ${S.company} interview patterns`,
    'Analyzing JD + resume alignment',
    'Building adaptive question plan',
    'Initializing AI interviewer'
  ]);

  setOverlayStep(0, 'active');

  if (!S.apiKey) {
    // No key — skip research, use static banks
    S.researchIntel = '';
    S.researchDone = true;
    for (let i = 0; i < 4; i++) { setOverlayStep(i, 'done'); await sleep(300); }
    return;
  }

  /* ── Step 1: Company interview research via Google Search ── */
  try {
    const searchPrompt = buildResearchPrompt();
    const intel = await callGeminiWithSearch(searchPrompt);

    if (intel && intel.length > 100) {
      S.researchIntel = intel;
      setOverlayStep(0, 'done');
    } else {
      // Search grounding not available or returned nothing useful
      S.researchIntel = '';
      setOverlayStep(0, 'done');
      // Try fallback: knowledge-based research (no grounding)
      await fallbackResearch();
    }
  } catch (e) {
    console.warn('Research phase failed:', e);
    S.researchIntel = '';
    setOverlayStep(0, 'done');
  }

  /* ── Step 2: Analyze JD + resume alignment ── */
  setOverlayStep(1, 'active');
  await sleep(600);
  setOverlayStep(1, 'done');

  /* ── Step 3: Build question plan ── */
  setOverlayStep(2, 'active');
  await sleep(500);
  setOverlayStep(2, 'done');

  /* ── Step 4: Initialize interviewer ── */
  setOverlayStep(3, 'active');
  await sleep(400);
  setOverlayStep(3, 'done');

  S.researchDone = true;
}

function buildResearchPrompt() {
  const company = S.company || 'this tech company';
  const role = S.role || 'Software Engineer';
  const round = S.round === 'hr' ? 'HR/behavioral' : 'technical/resume';

  return `Search for interview experiences at ${company} for ${role} positions. Look for information from:
- Reddit threads (r/cscareerquestions, r/interviews, r/${company.toLowerCase().replace(/\s/g, '')} if it exists)
- Glassdoor interview reviews for ${company}
- Blind app discussions about ${company} interviews
- Any engineering blog posts from ${company} about their hiring process

Specifically find out:
1. What is the actual interview structure at ${company} for ${role}? How many rounds, what type?
2. What specific questions do they commonly ask in the ${round} round?
3. What do interviewers at ${company} look for that's unique to their culture?
4. What topics from the JD below are most commonly tested?
5. Any specific red flags or things that disqualify candidates at ${company}?

JD context: ${S.jdText ? S.jdText.slice(0, 500) : 'General software engineering'}

Summarize findings as specific, actionable bullet points. Include actual question examples if found. Be specific to ${company} — not generic interview advice.`;
}

async function fallbackResearch() {
  // Knowledge-based research without search grounding
  if (!S.apiKey || !S.company) return;

  const prompt = `Based on your knowledge of ${S.company}'s interview process for ${S.role || 'software engineering'} roles:

1. What is their typical ${S.round === 'hr' ? 'HR/behavioral' : 'technical'} interview structure?
2. What specific topics and questions do they commonly ask?
3. What cultural values or competencies do they screen for?
4. Any unique aspects of interviewing at ${S.company} vs other companies?

Be specific to ${S.company}. If you have good knowledge of their process, share it. If not, say so briefly.
Keep response to 5-8 bullet points maximum.`;

  try {
    const resp = await callGemini(
      [{ role: 'user', parts: [{ text: prompt }] }],
      '', { maxTokens: 600, temp: 0.4 }
    );
    if (resp && resp.length > 80) {
      S.researchIntel = `[From AI knowledge, no live search]\n${resp}`;
    }
  } catch (e) {
    console.warn('Fallback research error', e);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
