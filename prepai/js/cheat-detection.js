/* ═══════════════════════════════════════════
   CHEAT-DETECTION.JS
   Three detection vectors:
   1. Speech cadence uniformity (scripted reading)
   2. Gaze/reading patterns (from video analysis)
   3. AI-generated language patterns (text analysis)
═══════════════════════════════════════════ */

/* ── Main entry point: called after each submitted answer ── */
function runCheatAnalysis(transcript, durationMs) {
  if (!transcript || transcript.trim().length < 30) return;

  analyzeCadence();
  detectAiLanguagePatterns(transcript);
  // Gaze signals come from video-analysis.js via processVideoCheatSignal()
}

/* ── Vector 1: Speech cadence uniformity ── */
function analyzeCadence() {
  const ts = S.speechTimestamps;
  if (ts.length < 8) return; // not enough data points

  const intervals = [];
  for (let i = 1; i < ts.length; i++) {
    intervals.push(ts[i].time - ts[i - 1].time);
  }

  // Filter outliers (pauses > 3s are natural — thinking, not uniformity)
  const filtered = intervals.filter(x => x < 3000);
  if (filtered.length < 6) return;

  const mean = filtered.reduce((a, b) => a + b, 0) / filtered.length;
  const variance = filtered.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / filtered.length;
  const cv = Math.sqrt(variance) / mean; // Coefficient of Variation

  // Natural speech CV: 0.4 – 0.9 (highly variable)
  // Scripted/reading CV: < 0.22 (unnaturally uniform)
  if (cv < 0.22 && mean < 600) {
    flagCheat('cadence', `Speech timing is unusually uniform (CV=${cv.toFixed(2)}). This pattern is consistent with reading from a script or notes.`);
  }

  // Also check words-per-second (reading is typically faster than natural speech)
  const totalChars = ts[ts.length - 1]?.charCount || 0;
  const totalMs = ts[ts.length - 1]?.time - ts[0]?.time || 1;
  const wordsPerMin = (totalChars / 5) / (totalMs / 60000); // rough estimate

  if (wordsPerMin > 220 && cv < 0.3) {
    // 220+ WPM with low variance = likely reading
    flagCheat('cadence', `Answer delivered at ${Math.round(wordsPerMin)} WPM with low natural variation — faster and more uniform than typical spoken answers.`);
  }
}

/* ── Vector 2: AI-generated language patterns ── */
function detectAiLanguagePatterns(text) {
  const lower = text.toLowerCase();
  let score = 0;
  const signals = [];

  // AI opener patterns
  const aiOpeners = [
    /^(certainly|absolutely|of course|sure|great question|that's a great|as an ai|i'd be happy to)/i,
    /^(firstly|to begin with|to start with|let me start by)/i,
  ];
  for (const rx of aiOpeners) {
    if (rx.test(text.trim())) { score += 2; signals.push('AI-style opener'); }
  }

  // Perfect enumeration (sounds unnatural in speech)
  if (/firstly.{10,}secondly.{10,}(thirdly|lastly|finally)/i.test(text)) {
    score += 2; signals.push('Numbered list structure');
  }

  // Overly formal transition phrases (unnatural in interview speech)
  const formalPhrases = [
    'it is worth noting', 'it is important to note', 'it\'s worth mentioning',
    'in conclusion', 'to summarize', 'in summary', 'to reiterate',
    'from a holistic perspective', 'leveraging synergies',
    'at the end of the day', 'moving forward'
  ];
  const formalCount = formalPhrases.filter(p => lower.includes(p)).length;
  if (formalCount >= 2) { score += formalCount; signals.push(`${formalCount} formal/corporate phrases`); }

  // Zero filler words in a long answer (very unusual for natural speech)
  const wordCount = text.trim().split(/\s+/).length;
  const fillerCount = (text.match(/\b(um|uh|like|you know|so|well|i mean|right|kind of|sort of)\b/gi) || []).length;
  if (wordCount > 80 && fillerCount === 0) {
    score += 1.5; signals.push('Zero filler words in long answer');
  }

  // Perfect sentence structure — very long average sentence length
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  if (sentences.length >= 3) {
    const avgLen = sentences.reduce((a, s) => a + s.trim().split(/\s+/).length, 0) / sentences.length;
    if (avgLen > 32) { score += 1; signals.push(`Long avg sentence length (${Math.round(avgLen)} words)`); }
  }

  // Repeated "I" at the start of sentences (AI often repeats this)
  const iStarters = (text.match(/\. I /g) || []).length;
  if (iStarters >= 5) { score += 0.5; signals.push('Repetitive sentence structure'); }

  if (score >= 3) {
    flagCheat('ai_text',
      `Answer matches AI-generated language patterns: ${signals.join(', ')}.`
    );
  }
}

/* ── Vector 3: Process gaze signal from video analysis ── */
function processVideoCheatSignal(signal, questionIndex) {
  if (!signal || signal === 'none') return;

  const messages = {
    reading: 'Eyes detected in a left-to-right scanning pattern consistent with reading from notes or a screen.',
    offscreen: 'Candidate repeatedly looking away from camera — possibly consulting off-screen notes or a second device.',
    distracted: 'Attention appears scattered — eyes frequently moving off-camera without a clear focal point.'
  };

  if (messages[signal]) {
    flagCheat('gaze', messages[signal], questionIndex);
  }
}

/* ── Flag a cheat event ── */
function flagCheat(type, detail, questionIndex = null) {
  // Debounce: don't re-flag same type within 45 seconds
  const now = Date.now();
  const recent = S.cheatFlags.find(f => f.type === type && now - f.timestamp < 45000);
  if (recent) return;

  const flag = {
    type,
    detail,
    questionIndex: questionIndex !== null ? questionIndex : S.currentQ,
    timestamp: now
  };
  S.cheatFlags.push(flag);

  updateCheatFlagsUI();
  showCheatWarning(type);
}

/* ── Update the cheat flags section in the body language panel ── */
function updateCheatFlagsUI() {
  const container = document.getElementById('cheat-flags-section');
  if (!container) return;

  if (S.cheatFlags.length === 0) {
    container.innerHTML = '<div class="cheat-flags-clean">No integrity flags detected</div>';
    return;
  }

  const label = `<div class="cheat-flags-label">⚠ Integrity Signals (${S.cheatFlags.length})</div>`;
  const flags = S.cheatFlags.slice(-3).reverse().map(f => {
    const typeLabels = {
      cadence: 'Speech Cadence',
      ai_text: 'AI Language Patterns',
      gaze: 'Eye Movement / Gaze',
      offscreen: 'Off-Screen Activity'
    };
    return `<div class="cheat-flag-item">
      <div class="cheat-flag-type">${typeLabels[f.type] || f.type}</div>
      <div class="cheat-flag-detail">${f.detail}</div>
      <div class="cheat-flag-time">Q${f.questionIndex} · ${new Date(f.timestamp).toLocaleTimeString()}</div>
    </div>`;
  }).join('');

  container.innerHTML = label + flags;
}

/* ── Subtle toast warning ── */
function showCheatWarning(type) {
  const msgs = {
    cadence: '⚠ Cadence flag — speech timing unusual',
    ai_text: '⚠ Answer patterns flagged — sounds scripted',
    gaze: '⚠ Eye contact flag — look at the camera',
    offscreen: '⚠ Off-screen activity detected'
  };
  showToast(msgs[type] || '⚠ Integrity signal detected', 4000);
}

/* ── Get cheat summary for feedback report ── */
function getCheatSummary() {
  return {
    flags: S.cheatFlags,
    count: S.cheatFlags.length,
    types: [...new Set(S.cheatFlags.map(f => f.type))],
    clean: S.cheatFlags.length === 0
  };
}
