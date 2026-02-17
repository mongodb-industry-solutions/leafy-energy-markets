'use client';

import { useState } from 'react';
import { css } from '@emotion/css';
import TextInput from '@leafygreen-ui/text-input';
import Button from '@leafygreen-ui/button';
import Icon from '@leafygreen-ui/icon';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const { darkMode } = useDarkMode();
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={css`
        display: flex;
        gap: 12px;
        align-items: flex-end;
        padding: 16px 0 0;
        border-top: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
      `}
    >
      <div className={css`flex: 1;`}>
        <TextInput
          aria-label="Chat message"
          placeholder="Ask about your portfolio, scenarios, or market data..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          darkMode={darkMode}
        />
      </div>
      <Button
        variant="primary"
        type="submit"
        disabled={!value.trim() || disabled}
        darkMode={darkMode}
        leftGlyph={<Icon glyph="Sparkle" />}
      >
        Send
      </Button>
    </form>
  );
}
