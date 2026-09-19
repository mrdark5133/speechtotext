# Debugging Prompt: Spoken Input ≠ Spoken Output

> Paste this into Claude Code / Cursor. Symptom: user speaks something, but
> what comes back as speech is different from what they said. This is almost
> always a pipeline bug, not a model quality problem — find the break point
> before touching any model.

---

## The pipeline has 5 stages. The bug is in exactly one of them.

```
[1] Record audio  →  [2] Send to ASR  →  [3] ASR returns text  →
[4] Send text to TTS  →  [5] TTS returns audio you hear
```

Add a log/print statement between EVERY stage and run one test end to end.
Do not guess — instrument first.

```python
# Add this logging at each stage, temporarily, to isolate the break
print(f"[1] Recorded audio: {len(audio_bytes)} bytes, duration={duration}s")
print(f"[2] Sending to ASR with language={language}")
print(f"[3] ASR returned: '{transcribed_text}'")
print(f"[4] Sending to TTS: '{text_to_synthesize}' lang={tts_language}")
print(f"[5] TTS returned: {len(audio_out)} bytes")
```

Then speak ONE known phrase (e.g. "I need water") and check the logs against
this table:

| What you observe in logs | Where the bug is |
|---|---|
| Step [3] text is already wrong/garbled | **ASR problem** — not a pipeline bug, go back to the fine-tuning/diagnosis prompt from before |
| Step [3] text is correct, but step [4] shows different text | **Bug between ASR output and TTS input** — most common cause below |
| Step [3] and [4] both show correct text, but step [5] audio sounds wrong | **TTS problem** — wrong voice/language code, not a transcription issue |
| Step [1] shows 0 bytes or very short duration | **Recording problem** — mic permission, wrong format, truncated before send |
| Everything logs correctly but the SOUND you hear is still wrong | **Playback problem** — check you're not playing a cached/previous audio file by mistake |

---

## Most likely bug: stale text between steps 3 and 4

This is the single most common cause of "I said X, it spoke Y." Check these
in order:

**1. You're using a cached/hardcoded string instead of the ASR result.**

```dart
// BUG — speaks a fixed test string, ignores what ASR actually returned
final ttsInput = "Hello";  // ← hardcoded leftover from testing
await speechRepository.synthesize(ttsInput, language);

// FIX — use the actual transcription result
final ttsInput = asrResult.text;
await speechRepository.synthesize(ttsInput, language);
```

**2. Async/race condition — TTS fires before ASR result is actually assigned.**

```dart
// BUG — synthesize starts before transcribe finishes updating state
transcribe(audio);
synthesize(currentText, language);   // currentText not yet updated

// FIX — await the transcription result directly, don't read from shared state
final result = await transcribe(audio);
await synthesize(result.text, language);
```

**3. Symbol-board mode is overriding voice-input mode.**

If your app has BOTH modes (tap symbols to speak, AND speak to transcribe),
check that speaking doesn't accidentally re-trigger whatever text was already
in the sentence composer from symbol taps. The TTS call might be reading the
composer's leftover state, not the fresh ASR result.

```dart
// BUG — always speaks composer state, voice input never actually reaches TTS
void onVoiceInputReceived(String transcribedText) {
  composer.append(transcribedText);
  speak(composer.fullText);   // ← speaks EVERYTHING in composer, not just new text
}
```

**4. Language mismatch between what ASR detected and what TTS is told to use.**

```python
# BUG — ASR transcribes in Tamil, but TTS is hardcoded to Hindi
asr_result = transcribe(audio, language="ta")
tts_audio = synthesize(asr_result.text, language="hi")   # ← wrong, mismatched

# FIX — pass the SAME language through both stages
lang = "ta"
asr_result = transcribe(audio, language=lang)
tts_audio = synthesize(asr_result.text, language=lang)
```

Note: if ASR transcribes Tamil speech into Tamil-script text, but you then
tell Google TTS to speak it as Hindi, Google will either mispronounce it
badly or throw an error — Tamil script text through a Hindi voice does not
give you a Hindi translation, it gives you garbage. Translation and
TTS-language-selection are two different steps; don't conflate them.

**5. The gateway is silently swallowing the real ASR response and returning a fallback.**

Check your Spring Boot `MlClientService` — if the call to the ML service
times out or errors, is there a `catch` block that returns some default
string instead of propagating the error?

```java
// BUG — swallows the real error, returns misleading fixed text
try {
    return mlServiceClient.transcribe(audio, language);
} catch (Exception e) {
    return "error";   // ← or worse, some default phrase — client can't tell this failed
}

// FIX — propagate the failure so the client shows an error state, never fake text
try {
    return mlServiceClient.transcribe(audio, language);
} catch (Exception e) {
    log.error("ASR call failed", e);
    throw new AsrServiceException("Transcription failed", e);
}
```

---

## Task: add this diagnostic mode permanently (not just for this debug session)

Build a debug toggle that shows the intermediate text on screen before it's
spoken — this earns its keep beyond just fixing this bug, since it also lets
users correct a misheard word before it's spoken aloud (useful for the
low-confidence-ASR case from earlier too):

```dart
// Show the transcribed text in a confirmation chip before auto-speaking it,
// at least during testing/debug builds:
Text("Heard: \"${asrResult.text}\"")
ElevatedButton(onPressed: () => speak(asrResult.text), child: Text("Speak this"))
```

---

## Definition of done

- [ ] Logged all 5 pipeline stages for one test phrase, identified exactly
      which stage introduces the mismatch
- [ ] If ASR itself is wrong (step 3) — that's a model/audio problem, not this
      bug; go to the fine-tuning prompt instead
- [ ] If it's a pipeline bug — fixed the specific cause found above
- [ ] Verified fix works for at least 2 phrases per language, not just English
- [ ] No `catch` block anywhere silently returns fake/default text on failure
- [ ] Added a "heard: ..." confirmation step so future mismatches are visible
      immediately instead of only showing up as wrong audio
