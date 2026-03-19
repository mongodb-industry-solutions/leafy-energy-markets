'use client';

import { useState, useRef, useEffect } from 'react';
import { css } from '@emotion/css';
import Icon from '@leafygreen-ui/icon';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const { darkMode } = useDarkMode();
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [value]);

  const handleSubmit = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div
      className={css`
        display: flex;
        align-items: flex-end;
        gap: 8px;
        padding: 12px 16px;
        background: ${darkMode ? '#1a2a34' : palette.gray.light3};
        border-radius: 24px;
        border: 1px solid ${borderColor};
        transition: border-color 0.15s ease;
        &:focus-within {
          border-color: ${palette.green.base};
        }
      `}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Ask about your portfolio, market conditions, or EU policies...'}
        disabled={disabled}
        rows={1}
        className={css`
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          color: ${darkMode ? palette.gray.light2 : palette.gray.dark2};
          font-size: 14px;
          line-height: 1.5;
          resize: none;
          max-height: 200px;
          font-family: inherit;
          &::placeholder {
            color: ${darkMode ? palette.gray.dark1 : palette.gray.light1};
          }
          &:disabled {
            opacity: 0.5;
          }
        `}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSend}
        className={css`
          width: 32px;
          height: 32px;
          min-width: 32px;
          border-radius: 50%;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: ${canSend ? 'pointer' : 'default'};
          background: ${canSend ? palette.green.base : darkMode ? palette.gray.dark2 : palette.gray.light2};
          transition: background 0.15s ease, transform 0.1s ease;
          &:hover {
            ${canSend ? `background: ${palette.green.dark1}; transform: scale(1.05);` : ''}
          }
        `}
      >
        <Icon glyph="ArrowUp" size={16} fill={palette.white} />
      </button>
    </div>
  );
}
