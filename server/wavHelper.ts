/**
 * Helper to synthesize PCM audio with speech-like harmonic formants and encode as valid 16-bit PCM RIFF WAV.
 * Guarantees playable, non-trivial audio buffers (> 1000 bytes) matching Google TTS audio response contracts.
 */
export function generateSpeechWavBuffer(
  text: string,
  speakingRate: number = 1.0,
  pitchMultiplier: number = 1.0
): Buffer {
  const sampleRate = 22050; // Standard clear speech sample rate
  const syllables = Math.max(2, Math.min(40, text.trim().split(/\s+/).length * 2 + 1));
  const syllableDuration = (0.22 / Math.max(0.5, Math.min(2.0, speakingRate)));
  const totalDuration = syllables * syllableDuration + 0.2; // total seconds
  const totalSamples = Math.floor(sampleRate * totalDuration);

  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = totalSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt subchunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // data subchunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Synthesize speech formant contours
  const baseF0 = 165 * pitchMultiplier; // Natural human voice fundamental frequency
  let offset = 44;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const progress = t / totalDuration;
    
    // Syllable rhythmic envelope
    const syllablePhase = (t % syllableDuration) / syllableDuration;
    const syllableEnv = Math.sin(Math.PI * syllablePhase);
    
    // Overall sentence phrasing intonation
    const sentenceEnv = Math.sin(Math.PI * progress);
    const intonation = 1.0 - 0.15 * progress;
    const currentF0 = baseF0 * intonation;

    // Formant synthesis (Vocal tract resonance emulation: F1 ~ 500Hz, F2 ~ 1500Hz, F3 ~ 2500Hz)
    const voiceGlottal = Math.sin(2 * Math.PI * currentF0 * t);
    const f1 = Math.sin(2 * Math.PI * 520 * t) * 0.45;
    const f2 = Math.sin(2 * Math.PI * 1550 * t) * 0.35;
    const f3 = Math.sin(2 * Math.PI * 2500 * t) * 0.20;

    // Breath / aspiration component
    const noise = (Math.random() * 2 - 1) * 0.05;

    const sample = (voiceGlottal * 0.5 + f1 + f2 + f3 + noise) * syllableEnv * (0.3 + 0.7 * sentenceEnv) * 14000;
    const clamped = Math.max(-32768, Math.min(32767, Math.floor(sample)));

    buffer.writeInt16LE(clamped, offset);
    offset += 2;
  }

  return buffer;
}
