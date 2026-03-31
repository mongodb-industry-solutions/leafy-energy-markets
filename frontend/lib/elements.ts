/**
 * Element definitions for ai-sdk-elements.
 *
 * These define the @name{...} markers the LLM can output inline with text.
 * The backend Python prompt includes instructions generated from these names/schemas.
 * Client-side, useMarkdownElements parses them and renders the matching UI.
 */

import { z } from 'zod';

// ── Schemas ────────────────────────────────────────────────

export const sourceRefSchema = z.object({
  title: z.string(),
  type: z.string(),
  snippet: z.string(),
});

export const priceCardSchema = z.object({
  instrument: z.string(),
  price: z.number(),
  change: z.number(),
  unit: z.string().optional(),
});

export const positionCardSchema = z.object({
  instrument: z.string(),
  type: z.string(),
  quantity: z.number(),
  avgPrice: z.number(),
  currentPrice: z.number(),
  pnl: z.number(),
});

export const riskAlertSchema = z.object({
  level: z.enum(['high', 'medium', 'low']),
  title: z.string(),
  detail: z.string(),
});

// ── Element names (must match backend prompt and UI definitions) ──
export const ELEMENT_NAMES = {
  source: 'source_ref',
  price: 'price_card',
  position: 'position_card',
  risk: 'risk_alert',
} as const;
