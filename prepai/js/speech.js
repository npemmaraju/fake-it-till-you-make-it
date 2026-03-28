/* ═══════════════════════════════════════════
   SPEECH.JS — Voice recognition + transcript management
═══════════════════════════════════════════ */

function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('Speech recognition not supported. Use Chrome or Edge.');
    return false;
  }

  S.recognition = new SR();
  S.recognition.continuous = true;
  S.recognition.interimResults = true;
  S.recognition.lang = 'en-US';
  S.recognition.maxAlternatives = 1;

  S.recognition.onresult = (e) => {
    let interim = '', final = '';

    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        final += t;
      } else {
        interim += t;
      }
    }

    if (final) S.currentTranscript += final;

    // Record timestamp for cadence analysis
    const currentLength = (S.currentTranscript + interim).length;
    if (currentLength > S.lastInterimLength + 5) {
      S.speechTimestamps.push({ time: Date.now(), charCount: currentLength });
      S.lastInterimLength = currentLength;
    }

    updateTranscriptDisplay(S.currentTranscript + interim);
  };

  S.recognition.onend = () => {
    if (S.isListening) {
      try { S.recognition.start(); } catch (e) { }
    }
  };

  S.recognition.onerror = (e) => {
    if (e.error === 'not-allowed') {
      showToast('Microphone access denied.');
      setListeningState(false);
    } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
      console.error('Speech recognition error:', e.error);
    }
  };

  return true;
}

function updateTranscriptDisplay(text) {
  const el  = document.getElementById('transcript-bar-text');
  const bar = document.getElementById('transcript-bar');
  const sub = document.getElementById('zoom-submit-btn');

  if (text && text.trim()) {
    el.textContent = text;
    el.classList.remove('placeholder');
    if (sub) { sub.classList.add('ready'); sub.disabled = false; }
    bar.classList.add('visible');
  } else {
    el.textContent = 'Speak your answer...';
    el.classList.add('placeholder');
    if (sub) { sub.classList.remove('ready'); sub.disabled = true; }
  }
}

function toggleListening() {
  if (!S.waitingAnswer) {
    showToast('Wait for the question to finish first.');
    return;
  }
  if (S.isListening) {
    setListeningState(false);
    // Auto-submit after 2s pause if there's content
    setTimeout(() => {
      if (S.currentTranscript.trim().length > 8 && !S.isListening) {
        submitVoiceAnswer();
      }
    }, 2000);
  } else {
    if (!S.recognition && !initSpeechRecognition()) return;
    S.currentTranscript = '';
    S.speechTimestamps = [];
    S.lastInterimLength = 0;
    S.answerStartTime = Date.now();
    updateTranscriptDisplay('');
    setListeningState(true);
  }
}

function setListeningState(listening) {
  S.isListening = listening;

  const speakBtn  = document.getElementById('zoom-speak-btn');
  const tBar      = document.getElementById('transcript-bar');
  const micStatus = document.getElementById('mic-status-iv');
  const micLabel  = document.getElementById('mic-iv-label');
  const speakLbl  = document.getElementById('speak-btn-label');
  const statusDot = document.getElementById('zoom-status-dot');
  const statusTxt = document.getElementById('zoom-status-text');

  speakBtn?.classList.toggle('listening', listening);
  tBar?.classList.toggle('visible', listening || S.currentTranscript.length > 0);
  tBar?.classList.toggle('listening', listening);
  micStatus?.classList.toggle('active', listening);

  if (listening) {
    if (micLabel) micLabel.textContent = 'LIVE';
    if (speakLbl) speakLbl.textContent = 'Listening...';
    if (statusDot) statusDot.className = 'zoom-status-dot live';
    if (statusTxt) statusTxt.textContent = 'Listening — speak your answer';
    try { S.recognition.start(); } catch (e) { }
    animateWaveBars(true);
  } else {
    if (micLabel) micLabel.textContent = 'MIC';
    if (speakLbl) speakLbl.textContent = S.currentTranscript ? 'Submit ↑' : 'Speak';
    if (statusDot) statusDot.className = 'zoom-status-dot ready';
    if (statusTxt) statusTxt.textContent = S.currentTranscript ? 'Answer recorded — press Submit' : 'Your turn to answer';
    try { S.recognition.stop(); } catch (e) { }
    animateWaveBars(false);
  }
}

function animateWaveBars(on) {
  const bars = document.querySelectorAll('#transcript-wave .twbar');
  if (!on) { bars.forEach(b => b.style.height = '4px'); return; }
  function tick() {
    if (!S.isListening) return;
    bars.forEach(b => { b.style.height = (Math.random() * 16 + 2) + 'px'; });
    setTimeout(tick, 100);
  }
  tick();
}

/* ── In-interview mic/cam toggles ── */
function toggleIvMic() {
  S.micOn = !S.micOn;
  if (S.stream) S.stream.getAudioTracks().forEach(t => t.enabled = S.micOn);
  document.getElementById('iv-mic-btn')?.classList.toggle('muted', !S.micOn);
  if (!S.micOn && S.isListening) setListeningState(false);
}

function toggleIvCam() {
  S.camOn = !S.camOn;
  if (S.stream) S.stream.getVideoTracks().forEach(t => t.enabled = S.camOn);
  document.getElementById('iv-cam-btn')?.classList.toggle('muted', !S.camOn);
  const sv = document.getElementById('self-video');
  if (sv) sv.style.filter = S.camOn ? 'none' : 'brightness(0)';
}
