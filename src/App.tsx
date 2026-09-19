import React, { useState, useEffect } from "react";
import { SupportedLanguageCode, SUPPORTED_LANGUAGES } from "./shared/languages.ts";
import { Header, AppTabType } from "./components/Header.tsx";
import { LanguageSelector } from "./components/LanguageSelector.tsx";
import { AsrSection } from "./components/AsrSection.tsx";
import { TtsSection } from "./components/TtsSection.tsx";
import { VocabularySection } from "./components/VocabularySection.tsx";
import { VoiceLibrarySection } from "./components/VoiceLibrarySection.tsx";
import { TestSuiteSection } from "./components/TestSuiteSection.tsx";
import { ArchitectureSection } from "./components/ArchitectureSection.tsx";
import { getLocalCacheSize } from "./utils/audioCache.ts";
import { getAllVoiceRecordings } from "./utils/voiceLibrary.ts";
import { apiFetch } from "./utils/apiClient.ts";
import { ShieldCheck, Cpu, Mic, Volume2 } from "lucide-react";

export default function App() {
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguageCode>("hi");
  const [activeTab, setActiveTab] = useState<AppTabType>("workbench");
  const [cacheCount, setCacheCount] = useState<number>(0);
  const [voiceCount, setVoiceCount] = useState<number>(0);
  const [ttsInitialText, setTtsInitialText] = useState<string | undefined>(undefined);
  const [systemVerified, setSystemVerified] = useState<boolean>(false);

  const refreshVoiceCount = async () => {
    try {
      const recordings = await getAllVoiceRecordings();
      setVoiceCount(recordings.length);
    } catch (e) {
      console.warn("Error checking voice recordings:", e);
    }
  };

  useEffect(() => {
    // Ping startup check
    apiFetch("/api/startup-check")
      .then((res) => res.json())
      .then(() => setSystemVerified(true))
      .catch((e) => console.warn("Startup check ping:", e));

    setCacheCount(getLocalCacheSize());
    refreshVoiceCount();
  }, []);

  const handleAudioCached = () => {
    setCacheCount(getLocalCacheSize());
    refreshVoiceCount();
  };

  const handleSendToTts = (text: string, language: SupportedLanguageCode) => {
    setTtsInitialText(text);
    setCurrentLanguage(language);
    setActiveTab("workbench");
  };

  const currentInfo = SUPPORTED_LANGUAGES[currentLanguage];

  return (
    <div className="min-h-screen bg-neutral-100/70 text-neutral-900 flex flex-col font-sans">
      {/* Top Navigation */}
      <Header
        currentLanguage={currentLanguage}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        cacheCount={cacheCount}
        voiceCount={voiceCount}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Global Language Selector (Present across all views so language can always be switched) */}
        <LanguageSelector
          selectedLanguage={currentLanguage}
          onSelectLanguage={(code) => setCurrentLanguage(code)}
        />

        {/* Tab 1: Live Workbench (Task 1 & Task 2) */}
        {activeTab === "workbench" && (
          <div className="space-y-6">
            {/* ASR & TTS Sections stacked for maximum clarity and rich screen layout */}
            <div className="grid grid-cols-1 gap-6">
              <AsrSection
                currentLanguage={currentLanguage}
                onSendToTts={handleSendToTts}
                onVoiceSaved={refreshVoiceCount}
                onOpenVoiceLibrary={() => setActiveTab("voice-library")}
              />
              <TtsSection
                currentLanguage={currentLanguage}
                initialText={ttsInitialText}
                onAudioCached={handleAudioCached}
                onOpenVoiceLibrary={() => setActiveTab("voice-library")}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Voice Profile & Library */}
        {activeTab === "voice-library" && (
          <VoiceLibrarySection
            onSelectForTts={handleSendToTts}
            onVoiceListUpdated={refreshVoiceCount}
          />
        )}

        {/* Tab 3: Fixed AAC Vocabulary Grid (Task 3 & Task 4) */}
        {activeTab === "vocabulary" && (
          <VocabularySection
            currentLanguage={currentLanguage}
            onAudioCached={handleAudioCached}
            onOpenVoiceLibrary={() => setActiveTab("voice-library")}
          />
        )}

        {/* Tab 4: Test Suite & Definition of Done */}
        {activeTab === "test-suite" && <TestSuiteSection />}

        {/* Tab 5: Architecture & Single Source of Truth */}
        {activeTab === "architecture" && <ArchitectureSection />}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-500">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>
              6-Language Speech Engine • Whisper Small ASR ({currentInfo.whisper_name}) • Google Cloud TTS ({currentInfo.google_code})
            </span>
          </div>
          <div className="flex items-center space-x-4 font-mono text-[11px]">
            <span>Active: {currentLanguage.toUpperCase()}</span>
            <span>Saved Voice Clips: {voiceCount}</span>
            <span>Local Cache Units: {cacheCount}</span>
            <span>Single Source: ml/languages.py</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
