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

/* ── Vector 3: Process cheatDetection object from video analysis ── */
function processVideoCheatSignal(cheatDetection, questionIndex) {
  if (!cheatDetection) return;

  const { overallRisk, eyeMovement, backgroundAudio, speechContent } = cheatDetection;

  // Eye movement flag
  if (eyeMovement?.flag && eyeMovement.pattern && eyeMovement.pattern !== 'none') {
    flagCheat('gaze',
      `Eye movement pattern detected: ${eyeMovement.pattern}`,
      questionIndex
    );
  }

  // Background audio flag
  if (backgroundAudio?.flag && backgroundAudio.observation && backgroundAudio.observation !== 'none') {
    flagCheat('audio',
      `Background audio anomaly: ${backgroundAudio.observation}`,
      questionIndex
    );
  }

  // Speech content flag (from video read-aloud inference)
  if (speechContent?.flag && speechContent.observation && speechContent.observation !== 'none') {
    flagCheat('reading',
      `Delivery pattern: ${speechContent.observation}`,
      questionIndex
    );
  }

  // High-risk triggers the prominent banner alert regardless of debounce
  if (overallRisk === 'high') {
    const details = [
      eyeMovement?.flag ? eyeMovement.pattern : null,
      backgroundAudio?.flag ? backgroundAudio.observation : null,
      speechContent?.flag ? speechContent.observation : null,
    ].filter(Boolean).join(' · ');
    showCheatAlert('HIGH INTEGRITY RISK DETECTED', details || 'Multiple suspicious signals observed simultaneously.');
  } else if (overallRisk === 'medium') {
    const detail = [
      eyeMovement?.flag ? eyeMovement.pattern : null,
      backgroundAudio?.flag ? backgroundAudio.observation : null,
      speechContent?.flag ? speechContent.observation : null,
    ].filter(Boolean)[0];
    if (detail) showCheatAlert('Integrity Flag', detail);
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
      cadence:  'Speech Cadence',
      ai_text:  'AI Language Patterns',
      gaze:     'Eye Movement / Gaze',
      audio:    'Background Audio',
      reading:  'Read-Aloud Pattern',
      offscreen:'Off-Screen Activity'
    };
    return `<div class="cheat-flag-item">
      <div class="cheat-flag-type">${typeLabels[f.type] || f.type}</div>
      <div class="cheat-flag-detail">${f.detail}</div>
      <div class="cheat-flag-time">Q${f.questionIndex} · ${new Date(f.timestamp).toLocaleTimeString()}</div>
    </div>`;
  }).join('');

  container.innerHTML = label + flags;
}

/* ── Toast warning (subtle — for cadence / AI text flags) ── */
function showCheatWarning(type) {
  const msgs = {
    cadence:  '⚠ Cadence flag — speech timing unusual',
    ai_text:  '⚠ Answer patterns flagged — sounds scripted',
    gaze:     '⚠ Eye movement flag detected',
    audio:    '⚠ Background audio anomaly detected',
    reading:  '⚠ Read-aloud pattern detected',
    offscreen:'⚠ Off-screen activity detected'
  };
  showToast(msgs[type] || '⚠ Integrity signal detected', 4000);
}

/* ── Prominent banner alert (for video cheat detection) ── */
let _cheatAlertTimer = null;

function showCheatAlert(title, msg) {
  const banner = document.getElementById('cheat-alert-banner');
  if (!banner) return;

  document.getElementById('cheat-alert-title').textContent = title;
  document.getElementById('cheat-alert-msg').textContent = msg;

  banner.classList.remove('hidden', 'dismissing');

  // Auto-dismiss after 8 seconds
  clearTimeout(_cheatAlertTimer);
  _cheatAlertTimer = setTimeout(dismissCheatAlert, 8000);
}

function dismissCheatAlert() {
  const banner = document.getElementById('cheat-alert-banner');
  if (!banner) return;
  banner.classList.add('dismissing');
  setTimeout(() => banner.classList.add('hidden'), 300);
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
