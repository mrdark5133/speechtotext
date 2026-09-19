import React from "react";
import { Mic, Volume2, BookOpen, CheckCircle2, Code2, Sparkles, Activity, AudioWaveform } from "lucide-react";
import { SupportedLanguageCode, SUPPORTED_LANGUAGES } from "../shared/languages.ts";

export type AppTabType = "workbench" | "voice-library" | "vocabulary" | "test-suite" | "architecture";

interface HeaderProps {
  currentLanguage: SupportedLanguageCode;
  activeTab: AppTabType;
  onTabChange: (tab: AppTabType) => void;
  cacheCount: number;
  voiceCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentLanguage,
  activeTab,
  onTabChange,
  cacheCount,
  voiceCount = 0,
}) => {
  const currentInfo = SUPPORTED_LANGUAGES[currentLanguage];

  return (
    <header id="app-header" className="border-b border-neutral-200 bg-white sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Core Identity */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-display font-semibold text-lg text-neutral-900 tracking-tight">
                  Indic Speech Engine
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                  6-Language ASR + TTS
                </span>
              </div>
              <p className="text-xs text-neutral-500 hidden sm:block">
                Whisper Small ASR • Google Cloud Voice Synthesizer • Indic Caching
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 bg-neutral-100 p-1 rounded-xl">
            <button
              id="tab-workbench-btn"
              onClick={() => onTabChange("workbench")}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === "workbench"
                  ? "bg-white text-neutral-900 shadow-xs"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <Mic className="w-3.5 h-3.5 text-sky-600" />
              <span>Studio & Live API</span>
            </button>

            <button
              id="tab-voice-library-btn"
              onClick={() => onTabChange("voice-library")}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === "voice-library"
                  ? "bg-white text-neutral-900 shadow-xs"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <AudioWaveform className="w-3.5 h-3.5 text-amber-600" />
              <span>Voice Profile</span>
              {voiceCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold border border-amber-200">
                  {voiceCount}
                </span>
              )}
            </button>

            <button
              id="tab-vocabulary-btn"
              onClick={() => onTabChange("vocabulary")}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === "vocabulary"
                  ? "bg-white text-neutral-900 shadow-xs"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
              <span>Fixed AAC Grid</span>
              <span className="hidden md:inline-block px-1.5 py-0.2 rounded bg-neutral-200 text-neutral-700 text-[10px]">
                96 Audios
              </span>
            </button>

            <button
              id="tab-testsuite-btn"
              onClick={() => onTabChange("test-suite")}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === "test-suite"
                  ? "bg-white text-neutral-900 shadow-xs"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Test Suite</span>
            </button>

            <button
              id="tab-architecture-btn"
              onClick={() => onTabChange("architecture")}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === "architecture"
                  ? "bg-white text-neutral-900 shadow-xs"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-neutral-600" />
              <span className="hidden sm:inline">Architecture</span>
            </button>
          </nav>

          {/* Current language pill */}
          <div className="hidden lg:flex items-center space-x-2 border-l border-neutral-200 pl-4">
            <div className="text-right">
              <div className="text-xs font-semibold text-neutral-900 flex items-center space-x-1.5 justify-end">
                <span>{currentInfo.name}</span>
                <span className="text-neutral-400">({currentInfo.nativeName})</span>
              </div>
              <div className="text-[10px] text-neutral-500 font-mono">
                {currentInfo.google_code} • {currentInfo.whisper_name}
              </div>
            </div>
            <span className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 flex items-center justify-center font-bold text-xs uppercase">
              {currentInfo.code}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
