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

  const { overallRisk, multipleFaces, eyesDown, excessiveEyeMovement, backgroundAudio, speechContent } = cheatDetection;

  // Multiple faces in frame
  if (multipleFaces?.flag) {
    const count = multipleFaces.count > 1 ? multipleFaces.count : '2+';
    flagCheat('multiple_faces',
      `${count} faces detected in frame. ${multipleFaces.observation !== 'none' ? multipleFaces.observation : 'Another person appears to be present.'}`,
      questionIndex
    );
  }

  // Eyes looking down
  if (eyesDown?.flag && eyesDown.observation && eyesDown.observation !== 'none') {
    flagCheat('eyes_down',
      `Sustained downward gaze detected — ${eyesDown.observation}`,
      questionIndex
    );
  }

  // Excessive / suspicious eye movement
  if (excessiveEyeMovement?.flag && excessiveEyeMovement.observation && excessiveEyeMovement.observation !== 'none') {
    flagCheat('excessive_gaze',
      `Excessive eye movement: ${excessiveEyeMovement.observation}`,
      questionIndex
    );
  }

  // Background audio (visual inference from video frame)
  if (backgroundAudio?.flag && backgroundAudio.observation && backgroundAudio.observation !== 'none') {
    flagCheat('audio',
      `Background audio signal: ${backgroundAudio.observation}`,
      questionIndex
    );
  }

  // Speech content flag (read-aloud pattern)
  if (speechContent?.flag && speechContent.observation && speechContent.observation !== 'none') {
    flagCheat('reading',
      `Delivery pattern: ${speechContent.observation}`,
      questionIndex
    );
  }

  // Banner alert
  if (overallRisk === 'high') {
    const details = [
      multipleFaces?.flag ? `${multipleFaces.count > 1 ? multipleFaces.count : '2+'} faces in frame` : null,
      eyesDown?.flag ? 'eyes directed downward' : null,
      excessiveEyeMovement?.flag ? excessiveEyeMovement.observation : null,
      backgroundAudio?.flag ? backgroundAudio.observation : null,
      speechContent?.flag ? speechContent.observation : null,
    ].filter(Boolean).join(' · ');
    showCheatAlert('HIGH INTEGRITY RISK DETECTED', details || 'Multiple suspicious signals observed simultaneously.');
  } else if (overallRisk === 'medium') {
    const detail = [
      multipleFaces?.flag ? `${multipleFaces.count > 1 ? multipleFaces.count : 'Multiple'} faces in frame` : null,
      eyesDown?.flag ? eyesDown.observation : null,
      excessiveEyeMovement?.flag ? excessiveEyeMovement.observation : null,
      backgroundAudio?.flag ? backgroundAudio.observation : null,
      speechContent?.flag ? speechContent.observation : null,
    ].filter(Boolean)[0];
    if (detail) showCheatAlert('Integrity Flag', detail);
  }
}

/* ── Background audio monitor (Web Audio API — real-time, no Gemini) ── */
function startBackgroundAudioMonitor() {
  if (!S.stream) return;

  // Create a dedicated AudioContext + AnalyserNode with adequate frequency resolution
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;                  // 256 frequency bins
    analyser.smoothingTimeConstant = 0.4;

    const source = audioCtx.createMediaStreamSource(S.stream);
    source.connect(analyser);

    S.liveDetection.audioCtx = audioCtx;
    S.liveDetection.analyser = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount); // 256

    // Speech sits roughly 85–3000 Hz.
    // Bin width ≈ sampleRate / fftSize.  At 48 kHz → 93.75 Hz/bin.
    // Bin 1 ≈ 94 Hz, Bin 32 ≈ 3000 Hz — good enough for voice detection.
    const SPEECH_BIN_START = 1;
    const SPEECH_BIN_END   = 32;
    const ENERGY_THRESHOLD = 28;   // 0-255 average; speech typically 25-80
    const TRIGGER_FRAMES   = 4;    // 4 × 400 ms = 1.6 s sustained audio before flag

    S.liveDetection.audioMonitorId = setInterval(() => {
      // Only flag when the user is NOT speaking (their mic is idle)
      if (S.isListening) {
        S.liveDetection.speechFrameCount = 0;
        return;
      }

      analyser.getByteFrequencyData(dataArray);

      let energy = 0;
      for (let i = SPEECH_BIN_START; i <= SPEECH_BIN_END; i++) {
        energy += dataArray[i];
      }
      energy /= (SPEECH_BIN_END - SPEECH_BIN_START + 1);

      if (energy > ENERGY_THRESHOLD) {
        S.liveDetection.speechFrameCount++;
        if (S.liveDetection.speechFrameCount >= TRIGGER_FRAMES) {
          flagCheat('background_audio',
            `Sustained audio detected while you were not speaking — possible secondary speaker or background voice.`
          );
          S.liveDetection.speechFrameCount = 0; // reset after flagging
        }
      } else {
        // Decay slowly so brief silence doesn't reset a near-trigger
        S.liveDetection.speechFrameCount = Math.max(0, S.liveDetection.speechFrameCount - 1);
      }
    }, 400);

  } catch (e) {
    console.warn('Background audio monitor could not start:', e);
  }
}

function stopBackgroundAudioMonitor() {
  clearInterval(S.liveDetection.audioMonitorId);
  S.liveDetection.audioMonitorId = null;
  S.liveDetection.speechFrameCount = 0;
  if (S.liveDetection.audioCtx) {
    S.liveDetection.audioCtx.close().catch(() => {});
    S.liveDetection.audioCtx = null;
    S.liveDetection.analyser = null;
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

/* ── Shared type label map (used by both panel renderers) ── */
const CHEAT_TYPE_LABELS = {
  cadence:         'Speech Cadence',
  ai_text:         'AI Language Patterns',
  gaze:            'Eye Movement / Gaze',
  excessive_gaze:  'Excessive Eye Movement',
  eyes_down:       'Eyes Looking Down',
  multiple_faces:  'Multiple Faces Detected',
  audio:           'Background Audio (visual)',
  background_audio:'Background Audio (live)',
  reading:         'Read-Aloud Pattern',
  offscreen:       'Off-Screen Activity',
};

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
    return `<div class="cheat-flag-item">
      <div class="cheat-flag-type">${CHEAT_TYPE_LABELS[f.type] || f.type}</div>
      <div class="cheat-flag-detail">${f.detail}</div>
      <div class="cheat-flag-time">Q${f.questionIndex} · ${new Date(f.timestamp).toLocaleTimeString()}</div>
    </div>`;
  }).join('');

  container.innerHTML = label + flags;
}

/* ── Toast warning (subtle — for cadence / AI text flags) ── */
function showCheatWarning(type) {
  const msgs = {
    cadence:          '⚠ Cadence flag — speech timing unusual',
    ai_text:          '⚠ Answer patterns flagged — sounds scripted',
    gaze:             '⚠ Eye movement flag detected',
    excessive_gaze:   '⚠ Excessive eye movement detected',
    eyes_down:        '⚠ Eyes looking down — possible notes',
    multiple_faces:   '⚠ Multiple faces detected in frame',
    audio:            '⚠ Background audio anomaly detected',
    background_audio: '⚠ Background voice detected',
    reading:          '⚠ Read-aloud pattern detected',
    offscreen:        '⚠ Off-screen activity detected',
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
