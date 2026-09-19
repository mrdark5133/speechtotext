import React from "react";
import { SupportedLanguageCode, SUPPORTED_LANGUAGES, LANGUAGE_CODES } from "../shared/languages.ts";
import { Check, Globe2 } from "lucide-react";

interface LanguageSelectorProps {
  selectedLanguage: SupportedLanguageCode;
  onSelectLanguage: (code: SupportedLanguageCode) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  selectedLanguage,
  onSelectLanguage,
}) => {
  return (
    <div id="language-selector-section" className="bg-white rounded-2xl border border-neutral-200/80 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-3 border-b border-neutral-100">
        <div className="flex items-center space-x-2">
          <Globe2 className="w-4 h-4 text-sky-600" />
          <h2 className="text-sm font-semibold text-neutral-900">
            Target Indic Language Selection
          </h2>
          <span className="text-[11px] text-neutral-500">
            (Required parameter for ASR and TTS routers)
          </span>
        </div>
        <div className="text-xs text-neutral-500 font-mono">
          Single Source of Truth: <span className="font-semibold text-neutral-700">ml/languages.py</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {LANGUAGE_CODES.map((code) => {
          const lang = SUPPORTED_LANGUAGES[code];
          const isSelected = selectedLanguage === code;

          return (
            <button
              key={code}
              id={`lang-select-btn-${code}`}
              onClick={() => onSelectLanguage(code)}
              className={`relative text-left p-3 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? "bg-sky-50/80 border-sky-500 ring-2 ring-sky-500/20 shadow-xs"
                  : "bg-white border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50/60"
              }`}
            >
              <div className="flex items-start justify-between">
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold font-mono uppercase ${
                    isSelected ? "bg-sky-600 text-white" : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {code}
                </span>
                {isSelected && (
                  <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>

              <div className="mt-2">
                <div className="text-sm font-semibold text-neutral-900 leading-tight">
                  {lang.name}
                </div>
                <div className="text-xs text-neutral-500 font-medium mt-0.5 font-indic">
                  {lang.nativeName}
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-neutral-100/80 text-[10px] space-y-0.5 text-neutral-400">
                <div className="truncate">
                  Whisper: <span className="text-neutral-600 font-mono">{lang.whisper_name}</span>
                </div>
                <div className="truncate">
                  Google: <span className="text-neutral-600 font-mono">{lang.google_code}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
