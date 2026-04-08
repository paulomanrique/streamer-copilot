import { useMemo, useState } from 'react';

import { LANGUAGE_OPTIONS } from '../../shared/constants.js';
import type { LanguageOption } from '../../shared/types.js';
import { styles } from './app-styles.js';

interface LanguagePickerProps {
  label?: string;
  selectedCode: string;
  onChange: (code: string) => void;
}

export function LanguagePicker({
  label = 'Language',
  selectedCode,
  onChange,
}: LanguagePickerProps) {
  const [query, setQuery] = useState('');

  const selectedLanguage = useMemo(
    () => LANGUAGE_OPTIONS.find((option) => option.code === selectedCode) ?? LANGUAGE_OPTIONS[0],
    [selectedCode],
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return LANGUAGE_OPTIONS;

    return LANGUAGE_OPTIONS.filter((option) =>
      [option.code, option.label, option.nativeLabel].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [query]);

  return (
    <section style={styles.previewCard}>
      <div style={styles.previewHeader}>
        <div>
          <h3 style={styles.sectionTitle}>{label}</h3>
          <p style={styles.helper}>Searchable BCP-47 picker for TTS settings and voice command forms.</p>
        </div>
        <span style={styles.selectionPill}>{selectedLanguage.code}</span>
      </div>

      <div style={styles.pickerSurface}>
        <input
          type="search"
          value={query}
          placeholder="Search by code or language name"
          style={styles.searchInput}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div style={styles.listbox}>
          {filteredOptions.map((option) => (
            <LanguageOptionButton
              key={option.code}
              option={option}
              selected={option.code === selectedCode}
              onSelect={onChange}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

interface LanguageOptionButtonProps {
  option: LanguageOption;
  selected: boolean;
  onSelect: (code: string) => void;
}

function LanguageOptionButton({ option, selected, onSelect }: LanguageOptionButtonProps) {
  return (
    <button
      type="button"
      style={selected ? styles.listboxButtonActive : styles.listboxButton}
      onClick={() => onSelect(option.code)}
    >
      <span>{option.label}</span>
      <span style={styles.listboxMeta}>
        {option.nativeLabel} · {option.code}
      </span>
    </button>
  );
}
