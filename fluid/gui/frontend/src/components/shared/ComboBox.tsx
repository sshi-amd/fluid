import React, { useState, useRef, useEffect } from 'react';
import styles from './ComboBox.module.css';

interface ComboBoxProps {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  id?: string;
}

export function ComboBox({ value, onChange, options, placeholder, id }: ComboBoxProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(value.toLowerCase())
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function select(v: string) {
    onChange(v);
    setOpen(false);
    setHighlighted(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault();
      select(filtered[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className={styles.comboBox} ref={containerRef}>
      <input
        id={id}
        type="text"
        className={`${styles.fieldInput} ${styles.comboInput}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlighted(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      <button
        className={styles.comboToggle}
        type="button"
        tabIndex={-1}
        onClick={() => setOpen((o) => !o)}
      >
        ▾
      </button>
      {open && filtered.length > 0 && (
        <div className={`${styles.comboDropdown} ${styles.open}`}>
          {filtered.map((opt, i) => (
            <div
              key={opt}
              className={[
                styles.comboOption,
                i === highlighted ? styles.highlighted : '',
                opt === value ? styles.active : '',
              ].filter(Boolean).join(' ')}
              onMouseDown={() => select(opt)}
              onMouseEnter={() => setHighlighted(i)}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
