/* ═══════════════════════════════════════════
   TTS.JS — Text-to-speech for interviewer questions
   Uses Web Speech API (SpeechSynthesis)
   Works in Chrome, Edge, Safari
═══════════════════════════════════════════ */

let _ttsVoice = null;
let _ttsReady = false;
let _ttsEnabled = true;

/* ── Load voices (async in Chrome) ── */
function initTTS() {
  if (!window.speechSynthesis) {
    console.warn('SpeechSynthesis not supported.');
    return;
  }

  function pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;

    // Preference order: Google US English > Samantha > any en-US > first available
    _ttsVoice =
      voices.find(v => v.name === 'Google US English') ||
      voices.find(v => v.name === 'Samantha') ||
      voices.find(v => v.name.includes('Alex')) ||
      voices.find(v => v.lang === 'en-US' && !v.localService) ||
      voices.find(v => v.lang === 'en-US') ||
      voices.find(v => v.lang.startsWith('en')) ||
      voices[0];

    _ttsReady = true;
  }

  pickVoice();
  // Chrome loads voices async
  window.speechSynthesis.onvoiceschanged = pickVoice;
}

/* ── Speak a question, call onDone when finished ── */
function speakQuestion(text, onDone) {
  if (!_ttsEnabled || !window.speechSynthesis) {
    // TTS disabled or unavailable — just call onDone immediately
    if (onDone) onDone();
    return;
  }

  // Stop anything currently speaking
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  if (_ttsVoice) utterance.voice = _ttsVoice;
  utterance.rate   = 0.92;   // slightly slower than default — clearer
  utterance.pitch  = 1.0;
  utterance.volume = 1.0;
  utterance.lang   = 'en-US';

  utterance.onend = () => {
    if (onDone) onDone();
  };

  utterance.onerror = (e) => {
    // 'interrupted' is normal (user cancelled) — not a real error
    if (e.error !== 'interrupted' && e.error !== 'canceled') {
      console.warn('TTS error:', e.error);
    }
    if (onDone) onDone();
  };

  // Chrome bug: long utterances get cut off — split on sentence boundaries
  // and chain them
  const sentences = splitIntoSentences(text);
  speakSentences(sentences, onDone);
}

/* ── Split text into natural sentence chunks ── */
function splitIntoSentences(text) {
  // Split on ". " or "? " or "! " but keep the punctuation
  const parts = text.match(/[^.!?]+[.!?]*/g) || [text];
  return parts.map(s => s.trim()).filter(s => s.length > 0);
}

/* ── Speak sentences sequentially (Chrome bug workaround) ── */
function speakSentences(sentences, onDone) {
  if (!sentences.length) { if (onDone) onDone(); return; }

  let index = 0;

  function speakNext() {
    if (index >= sentences.length) { if (onDone) onDone(); return; }

    const utt = new SpeechSynthesisUtterance(sentences[index]);
    if (_ttsVoice) utt.voice = _ttsVoice;
    utt.rate   = 0.92;
    utt.pitch  = 1.0;
    utt.volume = 1.0;
    utt.lang   = 'en-US';

    utt.onend = () => { index++; speakNext(); };
    utt.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('TTS sentence error:', e.error);
      }
      if (onDone) onDone(); // bail on error
    };

    window.speechSynthesis.speak(utt);
  }

  speakNext();
}

/* ── Stop TTS immediately ── */
function stopSpeaking() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/* ── Toggle TTS on/off ── */
function toggleTTS() {
  _ttsEnabled = !_ttsEnabled;
  if (!_ttsEnabled) stopSpeaking();

  const btn = document.getElementById('tts-toggle-btn');
  if (btn) {
    btn.textContent = _ttsEnabled ? '🔊 Voice On' : '🔇 Voice Off';
    btn.classList.toggle('active', _ttsEnabled);
  }
  showToast(_ttsEnabled ? 'Interviewer voice on' : 'Interviewer voice off');
  return _ttsEnabled;
}

// Init on load
document.addEventListener('DOMContentLoaded', initTTS);
