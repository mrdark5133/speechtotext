/**
 * Handles Microphone audio recording and sample audio generation for testing.
 */

export interface RecordingSession {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

export async function startAudioRecording(
  onVolumeChange?: (volume: number) => void
): Promise<RecordingSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  let animationFrameId: number;

  const checkVolume = () => {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    const normalized = Math.min(1, average / 100);
    if (onVolumeChange) {
      onVolumeChange(normalized);
    }
    animationFrameId = requestAnimationFrame(checkVolume);
  };
  checkVolume();

  let selectedMimeType = "";
  const candidateMimeTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/wav",
  ];
  for (const candidate of candidateMimeTypes) {
    if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(candidate)) {
      selectedMimeType = candidate;
      break;
    }
  }

  const mediaRecorder = selectedMimeType
    ? new MediaRecorder(stream, { mimeType: selectedMimeType })
    : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  mediaRecorder.start(100); // 100ms slice

  return {
    stop: () => {
      return new Promise<Blob>((resolve) => {
        cancelAnimationFrame(animationFrameId);
        mediaRecorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          audioContext.close().catch(() => {});
          const actualMime = selectedMimeType || mediaRecorder.mimeType || "audio/webm";
          const finalBlob = new Blob(chunks, { type: actualMime });
          // [PIPELINE:1] Record audio — log blob produced
          console.log(`[PIPELINE:1] Recording complete — size=${finalBlob.size} bytes, mime=${actualMime}, chunks=${chunks.length}`);
          resolve(finalBlob);
        };
        mediaRecorder.stop();
      });
    },
    cancel: () => {
      cancelAnimationFrame(animationFrameId);
      stream.getTracks().forEach((track) => track.stop());
      audioContext.close().catch(() => {});
    },
  };
}

/**
 * Creates a synthetic speech audio clip (PCM WAV) in the browser for instant testing
 * without requiring microphone permissions.
 */
export function createSyntheticTestAudio(durationSeconds: number = 1.5): Blob {
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // Write WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, numSamples * 2, true);

  // Generate speech-like harmonic tone
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const f0 = 170 + 20 * Math.sin(2 * Math.PI * 2 * t);
    const sample =
      Math.sin(2 * Math.PI * f0 * t) * 0.5 +
      Math.sin(2 * Math.PI * 500 * t) * 0.3 +
      Math.sin(2 * Math.PI * 1500 * t) * 0.2;
    const envelope = Math.sin((Math.PI * t) / durationSeconds);
    const intVal = Math.floor(sample * envelope * 20000);
    view.setInt16(offset, Math.max(-32768, Math.min(32767, intVal)), true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}
