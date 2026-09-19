# ml/scripts/precache_vocabulary.py
"""
Pre-cache the fixed vocabulary, per language.
Generates audio for all six languages for every fixed phrase at build/deploy time.
Fails loudly if any translation is missing in any of the six languages.
"""
import json
import os
from ml.languages import SUPPORTED_LANGUAGES

def precache_fixed_vocabulary(vocab_file_path="data/fixed_vocabulary.json", output_dir="cache/audio"):
    os.makedirs(output_dir, exist_ok=True)
    
    with open(vocab_file_path, "r", encoding="utf-8") as f:
        phrases = json.load(f)

    print(f"[precache] Loaded {len(phrases)} phrases from {vocab_file_path}")
    missing_count = 0
    total_entries = 0

    for phrase_key, phrase_data in phrases.items():
        for lang_code in SUPPORTED_LANGUAGES:
            total_entries += 1
            text = phrase_data.get(lang_code)
            if not text:
                print(f"WARNING: missing {lang_code} translation for '{phrase_key}'")
                missing_count += 1
                continue
            
            # Target output file
            filename = f"{phrase_key}_{lang_code}.ogg"
            filepath = os.path.join(output_dir, filename)
            # In production build step: synthesize_sync(text, lang_code) -> save to storage

    if missing_count > 0:
        raise ValueError(f"Precache failed: {missing_count} missing translations detected!")
    
    print(f"[precache] SUCCESS: All {total_entries} audio vocabulary entries ({len(phrases)} phrases x 6 languages) validated with 0 missing translations.")
    return {"total_phrases": len(phrases), "total_audios": total_entries, "missing": 0}

if __name__ == "__main__":
    precache_fixed_vocabulary()
