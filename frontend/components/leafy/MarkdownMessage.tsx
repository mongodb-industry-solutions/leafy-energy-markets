'use client';

import { useMemo } from 'react';
import { useMarkdownElements } from 'ai-sdk-elements/react';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import { findMarkers } from 'ai-sdk-elements';
import type { UIMessage } from 'ai';
import { elementUIs } from '@/lib/elements-ui';

interface MarkdownMessageProps {
  text: string;
  isAnimating?: boolean;
}

/**
 * Build synthetic UIMessage parts so useMarkdownElements can resolve element state.
 *
 * Since our backend returns full responses (not streamed via AI SDK),
 * we parse @name{...} markers and create "data-element" parts with state "ready".
 * The element ID must match the pattern useMarkdownElements expects: "el-{index}".
 */
function buildSyntheticParts(text: string): UIMessage['parts'] {
  const parts: UIMessage['parts'] = [{ type: 'text' as const, text }];
  const markers = findMarkers(text);

  for (let i = 0; i < markers.length; i++) {
    try {
      const input = JSON.parse(markers[i].rawInput);
      parts.push({
        type: 'data-element',
        id: `el-${i}`,
        data: {
          state: 'ready',
          input,
          data: input,
        },
      } as unknown as UIMessage['parts'][number]);
    } catch {
      // Invalid JSON in marker — skip
    }
  }

  return parts;
}

export default function MarkdownMessage({ text, isAnimating }: MarkdownMessageProps) {
  const parts = useMemo(() => buildSyntheticParts(text), [text]);

  const { processedText, components, elementNames } = useMarkdownElements({
    text,
    parts,
    elements: elementUIs,
  });

  const allowedTags = useMemo(
    () =>
      Object.fromEntries(
        elementNames.map((name) => [name, ['dataElementId', 'dataElementState']]),
      ),
    [elementNames],
  );

  return (
    <Streamdown
      isAnimating={isAnimating}
      allowedTags={allowedTags}
      components={components}
    >
      {processedText}
    </Streamdown>
  );
}
