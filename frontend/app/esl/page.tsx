'use client';

import { useState, useEffect, useCallback } from 'react';
import { css } from '@emotion/css';
import { palette } from '@leafygreen-ui/palette';
import { H2, H3, Subtitle, Body, Overline } from '@leafygreen-ui/typography';
import Icon from '@leafygreen-ui/icon';
import { useDarkMode } from '@/components/Providers';
import {
  eslGetCatalog,
  eslGetEntities,
  eslGetRawDocuments,
  eslGetMetricsSummary,
  eslGetTimeseries,
  eslGetPrices,
  eslDeployViews,
  eslSeedData,
  eslGetStatus,
  type ESLCatalog,
  type ESLEntity,
  type ESLMetricsSummary,
} from '@/lib/api';

// ── Colour helpers ─────────────────────────────────────────────────────

const LAYER_COLORS = [
  { bg: '#0D3547', border: '#1A6B8A', label: '#4FB8D9' },
  { bg: '#1A3A1A', border: '#2D7A2D', label: '#5FBF5F' },
  { bg: '#3D2A00', border: '#8A6000', label: '#E6A800' },
  { bg: '#3A0D3A', border: '#7A1A7A', label: '#CC55CC' },
];

const ASSET_TYPE_COLOR: Record<string, string> = {
  PV: palette.yellow.base,
  WIND: palette.blue.base,
  BESS: palette.green.base,
};

const ASSET_TYPE_ICON: Record<string, string> = {
  PV: 'Sun',
  WIND: 'Diagram3',
  BESS: 'Save',
};

function cfColor(pct: number): string {
  if (pct >= 40) return palette.green.base;
  if (pct >= 25) return palette.yellow.base;
  if (pct >= 15) return '#F97316';
  return palette.red.base;
}

function socColor(pct: number): string {
  if (pct >= 75) return palette.green.base;
  if (pct >= 25) return palette.yellow.base;
  if (pct >= 10) return '#F97316';
  return palette.red.base;
}

// ── Sub-components ─────────────────────────────────────────────────────

function LayerCard({ layer, idx, dark }: { layer: { id: string; title: string; subtitle: string; primitives: string[] }; idx: number; dark: boolean }) {
  const c = LAYER_COLORS[idx];
  return (
    <div className={css`
      background: ${c.bg};
      border: 1px solid ${c.border};
      border-radius: 10px;
      padding: 16px;
      flex: 1;
    `}>
      <div className={css`display:flex;align-items:center;gap:8px;margin-bottom:8px;`}>
        <span className={css`
          background: ${c.border};
          color: ${c.label};
          font-size: 10px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 4px;
          letter-spacing: 0.5px;
        `}>{layer.id}</span>
        <Body className={css`color:${c.label}!important;font-weight:600!important;`}>{layer.title}</Body>
      </div>
      <Body className={css`color:${dark ? palette.gray.light2 : palette.gray.dark1}!important;font-size:12px!important;margin-bottom:8px!important;`}>
        {layer.subtitle}
      </Body>
      <div className={css`display:flex;flex-wrap:wrap;gap:4px;`}>
        {layer.primitives.map(p => (
          <span key={p} className={css`
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            background: ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
            color: ${dark ? palette.gray.light1 : palette.gray.dark2};
            font-family: monospace;
          `}>{p}</span>
        ))}
      </div>
    </div>
  );
}

function MiniSparkline({ data, color }: { data: { value_mw: number }[]; color: string }) {
  if (!data.length) return <span className={css`color:${palette.gray.base};font-size:11px;`}>No data</span>;
  const max = Math.max(...data.map(d => d.value_mw), 0.001);
  const w = 120, h = 32;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (d.value_mw / max) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} className={css`display:block;`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

function GaugeBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className={css`
      background: rgba(255,255,255,0.08);
      border-radius: 4px;
      height: 8px;
      width: 100%;
      overflow: hidden;
    `}>
      <div className={css`
        background: ${color};
        height: 100%;
        width: ${pct}%;
        border-radius: 4px;
        transition: width 0.5s ease;
      `} />
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────

export default function ESLPage() {
  const { darkMode } = useDarkMode();
  const bg = darkMode ? palette.black : palette.white;
  const cardBg = darkMode ? '#0D1F2D' : palette.gray.light3;
  const cardBorder = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const textPrimary = darkMode ? palette.white : palette.black;
  const textSecondary = darkMode ? palette.gray.light1 : palette.gray.dark2;

  const [catalog, setCatalog] = useState<ESLCatalog | null>(null);
  const [metrics, setMetrics] = useState<ESLMetricsSummary | null>(null);
  const [entities, setEntities] = useState<ESLEntity[]>([]);
  const [rawDocs, setRawDocs] = useState<Record<string, unknown>[]>([]);
  const [activeEntityType, setActiveEntityType] = useState<string>('PVSystem');
  const [timeseries, setTimeseries] = useState<Record<string, { value_mw: number }[]>>({});
  const [prices, setPrices] = useState<Record<string, { timestamp: string; price_eur_mwh: number }[]>>({});
  const [status, setStatus] = useState<{ healthy: boolean; views: { view: string; deployed: boolean }[] } | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'entities' | 'metrics' | 'market' | 'raw'>('overview');
  const [loading, setLoading] = useState(true);
  const [seedMsg, setSeedMsg] = useState('');
  const [deployMsg, setDeployMsg] = useState('');

  const ENTITY_TYPES = ['PVSystem', 'WindFarm', 'BatteryEnergyStorageSystem', 'BiddingZone'];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, met, stat] = await Promise.all([
        eslGetCatalog().catch(() => null),
        eslGetMetricsSummary().catch(() => null),
        eslGetStatus().catch(() => null),
      ]);
      setCatalog(cat);
      setMetrics(met);
      setStatus(stat);

      // Load timeseries for generation assets
      if (met?.capacity_factors) {
        const tsMap: Record<string, { value_mw: number }[]> = {};
        await Promise.all(
          met.capacity_factors.slice(0, 4).map(async (cf) => {
            const ts = await eslGetTimeseries(cf.asset_id, 'supply', 24).catch(() => null);
            if (ts) tsMap[cf.asset_id] = ts.data;
          })
        );
        setTimeseries(tsMap);
      }

      // Load market prices
      const priceData = await eslGetPrices().catch(() => null);
      if (priceData) setPrices(priceData.zones);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEntities = useCallback(async (type: string) => {
    const [ents, raw] = await Promise.all([
      eslGetEntities(type).catch(() => null),
      eslGetRawDocuments(type).catch(() => null),
    ]);
    setEntities(ents?.items ?? []);
    setRawDocs(raw?.raw_documents ?? []);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadEntities(activeEntityType); }, [activeEntityType, loadEntities]);

  const handleSeed = async () => {
    setSeeding(true);
    setSeedMsg('');
    try {
      const r = await eslSeedData(false);
      setSeedMsg(r.status === 'already_seeded' ? 'Already seeded — use force to re-seed.' : `Seeded ${r.assets} assets + timeseries.`);
      await loadData();
      await loadEntities(activeEntityType);
    } catch (e) {
      setSeedMsg('Seed failed — is the backend running?');
    } finally {
      setSeeding(false);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployMsg('');
    try {
      const r = await eslDeployViews(false);
      setDeployMsg(`Deployed ${r.deployed}/${r.total} views to MongoDB Atlas.`);
      const s = await eslGetStatus();
      setStatus(s);
    } catch {
      setDeployMsg('Deploy failed — is the backend running?');
    } finally {
      setDeploying(false);
    }
  };

  const LAYERS = [
    { id: 'L1', title: 'Entity Layer', subtitle: 'Named energy objects with typed fields', primitives: ['Atlas Views', 'JSON Schema', '$match', '$project'] },
    { id: 'L2', title: 'Relationship Layer', subtitle: 'Hierarchies, graph edges, REMIT linkages', primitives: ['$lookup', '$graphLookup', 'Portfolio→Site→Asset'] },
    { id: 'L3', title: 'Metric Layer', subtitle: 'Computed measures: CF, SoC, Penetration', primitives: ['Agg Pipelines', 'Scheduled Triggers', 'Vector Search'] },
    { id: 'L4', title: 'Governance Layer', subtitle: 'Access rules, lineage, audit trail, standards', primitives: ['App Services', 'Row-level security', 'Audit log'] },
  ];

  const tabs: { id: typeof activeTab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Architecture', icon: 'Diagram3' },
    { id: 'entities', label: 'Entity Browser', icon: 'Tag' },
    { id: 'metrics', label: 'Metrics', icon: 'Charts' },
    { id: 'market', label: 'Market Prices', icon: 'Megaphone' },
    { id: 'raw', label: 'Raw vs Governed', icon: 'CurlyBraces' },
  ];

  return (
    <div className={css`background:${bg};min-height:100vh;padding-bottom:48px;`}>

      {/* ── Header ── */}
      <div className={css`
        background: linear-gradient(135deg, #001f33 0%, #003d6b 50%, #004d2b 100%);
        padding: 28px 0 24px;
        margin-bottom: 28px;
        border-radius: 12px;
      `}>
        <div className={css`display:flex;align-items:flex-start;justify-content:space-between;padding:0 8px;flex-wrap:wrap;gap:16px;`}>
          <div>
            <div className={css`display:flex;align-items:center;gap:10px;margin-bottom:4px;`}>
              <Icon glyph="Diagram3" size={24} fill={palette.green.base} />
              <H2 className={css`color:${palette.white}!important;margin:0!important;`}>
                EnergySemanticLayer
              </H2>
              <span className={css`
                background: rgba(0,200,100,0.15);
                border: 1px solid ${palette.green.dark1};
                color: ${palette.green.base};
                font-size: 11px;
                font-weight: 700;
                padding: 2px 8px;
                border-radius: 4px;
                letter-spacing: 0.5px;
              `}>v0.1</span>
            </div>
            <Body className={css`color:${palette.gray.light1}!important;margin-left:34px!important;`}>
              MongoDB-native semantic data layer for energy markets · IEC 61970 CIM · ENTSO-E REMIT
            </Body>
          </div>

          <div className={css`display:flex;gap:10px;align-items:center;flex-wrap:wrap;`}>
            <div className={css`display:flex;align-items:center;gap:6px;`}>
              <div className={css`
                width: 8px; height: 8px; border-radius: 50%;
                background: ${status?.healthy ? palette.green.base : palette.yellow.base};
              `} />
              <Body className={css`color:${palette.gray.light1}!important;font-size:12px!important;`}>
                {status ? (status.healthy ? 'Views deployed' : 'Views pending') : 'Checking...'}
              </Body>
            </div>
            <button
              onClick={handleSeed}
              disabled={seeding}
              className={css`
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.2);
                color: ${palette.white};
                padding: 7px 14px;
                border-radius: 6px;
                font-size: 13px;
                cursor: pointer;
                display: flex; align-items: center; gap: 6px;
                &:hover { background: rgba(255,255,255,0.15); }
                &:disabled { opacity: 0.5; cursor: not-allowed; }
              `}
            >
              <Icon glyph="Upload" size={14} fill={palette.white} />
              {seeding ? 'Seeding...' : 'Seed Data'}
            </button>
            <button
              onClick={handleDeploy}
              disabled={deploying}
              className={css`
                background: ${palette.green.dark3};
                border: 1px solid ${palette.green.dark1};
                color: ${palette.green.light3};
                padding: 7px 14px;
                border-radius: 6px;
                font-size: 13px;
                cursor: pointer;
                display: flex; align-items: center; gap: 6px;
                &:hover { background: ${palette.green.dark2}; }
                &:disabled { opacity: 0.5; cursor: not-allowed; }
              `}
            >
              <Icon glyph="Megaphone" size={14} fill={palette.green.light3} />
              {deploying ? 'Deploying...' : 'Deploy Views'}
            </button>
          </div>
        </div>

        {(seedMsg || deployMsg) && (
          <div className={css`margin-top:12px;padding:0 8px;`}>
            <Body className={css`
              color: ${palette.green.light2}!important;
              font-size: 13px!important;
              background: rgba(0,200,100,0.08);
              border: 1px solid rgba(0,200,100,0.2);
              border-radius: 6px;
              padding: 6px 12px;
              display: inline-block;
            `}>{seedMsg || deployMsg}</Body>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className={css`display:flex;gap:4px;margin-bottom:24px;border-bottom:1px solid ${cardBorder};`}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={css`
              padding: 10px 16px;
              border: none;
              background: transparent;
              cursor: pointer;
              display: flex; align-items: center; gap: 6px;
              border-bottom: 2px solid ${activeTab === t.id ? palette.green.base : 'transparent'};
              color: ${activeTab === t.id ? palette.green.base : textSecondary};
              font-size: 13px;
              font-weight: ${activeTab === t.id ? 600 : 400};
              transition: all 0.15s;
              &:hover { color: ${palette.green.base}; }
            `}
          >
            <Icon glyph={t.icon as 'Diagram3'} size={14} fill={activeTab === t.id ? palette.green.base : undefined} />
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className={css`text-align:center;padding:48px;color:${textSecondary};`}>
          <Body>Loading ESL catalog from MongoDB...</Body>
        </div>
      )}

      {!loading && (
        <>
          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <div>
              {/* 4-layer architecture */}
              <div className={css`margin-bottom:28px;`}>
                <div className={css`display:flex;align-items:center;gap:8px;margin-bottom:14px;`}>
                  <H3 className={css`color:${textPrimary}!important;margin:0!important;`}>Semantic Layer Architecture</H3>
                  <span className={css`font-size:12px;color:${textSecondary};`}>— define once, consume everywhere</span>
                </div>
                <div className={css`display:flex;gap:10px;flex-wrap:wrap;`}>
                  {LAYERS.map((l, i) => <LayerCard key={l.id} layer={l} idx={i} dark={darkMode} />)}
                </div>
              </div>

              {/* Stats strip */}
              {metrics && (
                <div className={css`
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                  gap: 12px;
                  margin-bottom: 28px;
                `}>
                  {[
                    { label: 'Total Assets', value: metrics.portfolio_summary.total_assets, unit: 'assets', icon: 'Tag' },
                    { label: 'Solar Capacity', value: `${(metrics.portfolio_summary.total_solar_kwp / 1000).toFixed(1)}`, unit: 'MWp', icon: 'Sun' },
                    { label: 'Wind Capacity', value: `${(metrics.portfolio_summary.total_wind_kw / 1000).toFixed(0)}`, unit: 'MW', icon: 'Diagram3' },
                    { label: 'BESS Capacity', value: `${(metrics.portfolio_summary.total_bess_kwh / 1000).toFixed(0)}`, unit: 'MWh', icon: 'Save' },
                    { label: 'Renewable Pen.', value: metrics.renewable_penetration.renewable_penetration_pct.toFixed(1), unit: '%', icon: 'Charts' },
                  ].map(s => (
                    <div key={s.label} className={css`
                      background: ${cardBg};
                      border: 1px solid ${cardBorder};
                      border-radius: 10px;
                      padding: 16px;
                    `}>
                      <Overline className={css`color:${textSecondary}!important;`}>{s.label}</Overline>
                      <div className={css`display:flex;align-items:baseline;gap:4px;margin-top:4px;`}>
                        <span className={css`font-size:28px;font-weight:700;color:${palette.green.base};`}>{s.value}</span>
                        <span className={css`font-size:13px;color:${textSecondary};`}>{s.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Entity catalog grid */}
              {catalog && (
                <div>
                  <H3 className={css`color:${textPrimary}!important;margin-bottom:14px!important;`}>Registered Entities</H3>
                  <div className={css`
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 12px;
                  `}>
                    {Object.entries(catalog.entities).map(([name, e]) => (
                      <div key={name} className={css`
                        background: ${cardBg};
                        border: 1px solid ${cardBorder};
                        border-radius: 10px;
                        padding: 16px;
                        cursor: pointer;
                        &:hover { border-color: ${palette.green.dark1}; }
                      `} onClick={() => { setActiveEntityType(name); setActiveTab('entities'); }}>
                        <div className={css`display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;`}>
                          <Body className={css`font-weight:600!important;color:${textPrimary}!important;`}>{name}</Body>
                          <span className={css`
                            font-size:10px; padding:2px 6px; border-radius:3px;
                            background:rgba(0,200,100,0.1); color:${palette.green.base};
                            font-family:monospace;
                          `}>{e.iec_cim_class}</span>
                        </div>
                        <Body className={css`color:${textSecondary}!important;font-size:12px!important;`}>
                          {e.description}
                        </Body>
                        <div className={css`margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;`}>
                          {Object.keys(e.fields || {}).slice(0, 4).map((f: string) => (
                            <span key={f} className={css`
                              font-size:10px; padding:1px 5px; border-radius:3px;
                              background:${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'};
                              color:${textSecondary}; font-family:monospace;
                            `}>{f}</span>
                          ))}
                          {Object.keys(e.fields || {}).length > 4 && (
                            <span className={css`font-size:10px;color:${textSecondary};`}>+{Object.keys(e.fields).length - 4} more</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ENTITIES ── */}
          {activeTab === 'entities' && (
            <div>
              <div className={css`display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;`}>
                {ENTITY_TYPES.map(et => (
                  <button
                    key={et}
                    onClick={() => setActiveEntityType(et)}
                    className={css`
                      padding: 6px 14px;
                      border-radius: 20px;
                      border: 1px solid ${activeEntityType === et ? palette.green.base : cardBorder};
                      background: ${activeEntityType === et ? palette.green.dark3 : 'transparent'};
                      color: ${activeEntityType === et ? palette.green.light3 : textSecondary};
                      font-size: 13px;
                      cursor: pointer;
                      &:hover { border-color: ${palette.green.base}; }
                    `}
                  >
                    {et}
                  </button>
                ))}
              </div>

              {entities.length === 0 ? (
                <div className={css`
                  background:${cardBg}; border:1px solid ${cardBorder}; border-radius:10px;
                  padding:40px; text-align:center;
                `}>
                  <Body className={css`color:${textSecondary}!important;`}>
                    No {activeEntityType} entities found. Click <strong>Seed Data</strong> to populate demo assets.
                  </Body>
                </div>
              ) : (
                <div className={css`display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;`}>
                  {entities.map(entity => {
                    const assetType = entity.asset_type as string;
                    const accentColor = ASSET_TYPE_COLOR[assetType] || palette.blue.base;
                    const iconGlyph = ASSET_TYPE_ICON[assetType] || 'Tag';
                    const tsData = timeseries[entity.id] || [];

                    return (
                      <div key={entity.id} className={css`
                        background: ${cardBg};
                        border: 1px solid ${cardBorder};
                        border-radius: 10px;
                        padding: 16px;
                        border-top: 3px solid ${accentColor};
                      `}>
                        <div className={css`display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;`}>
                          <div className={css`display:flex;align-items:center;gap:8px;`}>
                            <Icon glyph={iconGlyph as 'Tag'} size={16} fill={accentColor} />
                            <Subtitle className={css`color:${textPrimary}!important;margin:0!important;font-size:14px!important;`}>
                              {entity.name as string}
                            </Subtitle>
                          </div>
                          <span className={css`
                            font-size:10px; padding:2px 7px; border-radius:10px;
                            background:${accentColor}22; color:${accentColor};
                            font-weight:600;
                          `}>{assetType}</span>
                        </div>

                        {entity.site && (
                          <div className={css`display:flex;align-items:center;gap:4px;margin-bottom:8px;`}>
                            <Icon glyph="Megaphone" size={11} fill={textSecondary} />
                            <Body className={css`color:${textSecondary}!important;font-size:11px!important;`}>
                              {(entity.site as {name:string}).name} · {(entity.site as {country:string}).country}
                            </Body>
                          </div>
                        )}

                        <div className={css`display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;`}>
                          {Object.entries(entity)
                            .filter(([k]) => !['id','name','asset_type','location','_esl_entity','_iec_cim_class','site','site_id','portfolio_id'].includes(k) && entity[k] !== null && entity[k] !== undefined)
                            .slice(0, 6)
                            .map(([k, v]) => (
                              <div key={k}>
                                <div className={css`font-size:10px;color:${textSecondary};font-family:monospace;`}>{k}</div>
                                <div className={css`font-size:12px;color:${textPrimary};font-weight:500;`}>
                                  {typeof v === 'number' ? v.toLocaleString() : String(v)}
                                </div>
                              </div>
                            ))}
                        </div>

                        <div className={css`
                          padding-top:8px;
                          border-top:1px solid ${cardBorder};
                          display:flex;align-items:center;justify-content:space-between;
                        `}>
                          <Body className={css`font-size:10px!important;color:${textSecondary}!important;font-family:monospace;`}>
                            {entity._iec_cim_class as string}
                          </Body>
                          {tsData.length > 1 && (
                            <MiniSparkline data={tsData} color={accentColor} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── METRICS ── */}
          {activeTab === 'metrics' && metrics && (
            <div>
              <div className={css`display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-bottom:24px;`}>

                {/* Renewable Penetration */}
                <div className={css`
                  background:${cardBg};border:1px solid ${cardBorder};border-radius:10px;padding:20px;
                  grid-column: span 1;
                `}>
                  <div className={css`display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;`}>
                    <Overline className={css`color:${textSecondary}!important;`}>Renewable Penetration</Overline>
                    <span className={css`font-size:10px;color:${palette.green.base};font-family:monospace;`}>RenewablePenetration</span>
                  </div>
                  <div className={css`display:flex;align-items:baseline;gap:6px;margin-bottom:12px;`}>
                    <span className={css`font-size:42px;font-weight:700;color:${palette.green.base};`}>
                      {metrics.renewable_penetration.renewable_penetration_pct.toFixed(1)}
                    </span>
                    <span className={css`font-size:18px;color:${textSecondary};`}>%</span>
                  </div>
                  <GaugeBar value={metrics.renewable_penetration.renewable_penetration_pct} color={palette.green.base} />
                  <div className={css`margin-top:8px;display:flex;justify-content:space-between;`}>
                    <Body className={css`font-size:11px!important;color:${textSecondary}!important;`}>
                      {metrics.renewable_penetration.renewable_mw.toFixed(1)} MW renewable
                    </Body>
                    <Body className={css`font-size:11px!important;color:${textSecondary}!important;`}>
                      {metrics.renewable_penetration.total_mw.toFixed(1)} MW total
                    </Body>
                  </div>
                </div>

                {/* BESS SoC */}
                {metrics.bess_soc.map(bess => (
                  <div key={bess.asset_id} className={css`
                    background:${cardBg};border:1px solid ${cardBorder};border-radius:10px;padding:20px;
                  `}>
                    <div className={css`display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;`}>
                      <Overline className={css`color:${textSecondary}!important;`}>State of Charge</Overline>
                      <span className={css`font-size:10px;color:${palette.green.base};font-family:monospace;`}>StateOfCharge</span>
                    </div>
                    <Body className={css`color:${textPrimary}!important;font-weight:600!important;margin-bottom:8px!important;font-size:13px!important;`}>
                      {bess.asset_name}
                    </Body>
                    <div className={css`display:flex;align-items:baseline;gap:6px;margin-bottom:8px;`}>
                      <span className={css`font-size:36px;font-weight:700;color:${socColor(bess.soc_pct ?? 0)};`}>
                        {(bess.soc_pct ?? 0).toFixed(0)}
                      </span>
                      <span className={css`font-size:16px;color:${textSecondary};`}>%</span>
                    </div>
                    <GaugeBar value={bess.soc_pct ?? 0} color={socColor(bess.soc_pct ?? 0)} />
                    <div className={css`margin-top:8px;`}>
                      <Body className={css`font-size:11px!important;color:${textSecondary}!important;`}>
                        {(bess.available_kwh ?? 0).toLocaleString()} kWh available · {bess.capacity_kwh.toLocaleString()} kWh total
                      </Body>
                    </div>
                  </div>
                ))}
              </div>

              {/* Capacity Factors */}
              <H3 className={css`color:${textPrimary}!important;margin-bottom:14px!important;`}>Capacity Factors — 24h</H3>
              <div className={css`display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;`}>
                {metrics.capacity_factors.map(cf => {
                  const color = cfColor(cf.capacity_factor_pct);
                  const tsData = timeseries[cf.asset_id] || [];
                  return (
                    <div key={cf.asset_id} className={css`
                      background:${cardBg};border:1px solid ${cardBorder};border-radius:10px;padding:16px;
                    `}>
                      <div className={css`display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;`}>
                        <Body className={css`font-weight:600!important;color:${textPrimary}!important;font-size:13px!important;`}>
                          {cf.asset_name}
                        </Body>
                        <span className={css`
                          font-size:10px; padding:2px 7px; border-radius:10px;
                          background:${ASSET_TYPE_COLOR[cf.asset_type] ?? palette.blue.base}22;
                          color:${ASSET_TYPE_COLOR[cf.asset_type] ?? palette.blue.base};
                          font-weight:600;
                        `}>{cf.asset_type}</span>
                      </div>
                      <div className={css`display:flex;align-items:baseline;gap:4px;margin:8px 0;`}>
                        <span className={css`font-size:32px;font-weight:700;color:${color};`}>
                          {cf.capacity_factor_pct.toFixed(1)}
                        </span>
                        <span className={css`font-size:14px;color:${textSecondary};`}>% CF</span>
                      </div>
                      <GaugeBar value={cf.capacity_factor_pct} color={color} />
                      <div className={css`margin-top:8px;display:flex;justify-content:space-between;align-items:flex-end;`}>
                        <div>
                          <Body className={css`font-size:11px!important;color:${textSecondary}!important;`}>
                            avg {cf.avg_mw.toFixed(2)} MW · cap {cf.capacity_mw.toFixed(1)} MW
                          </Body>
                          <Body className={css`font-size:10px!important;color:${textSecondary}!important;font-family:monospace!important;`}>
                            GeneratingUnit.normalPF
                          </Body>
                        </div>
                        {tsData.length > 1 && (
                          <MiniSparkline data={tsData} color={color} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── MARKET PRICES ── */}
          {activeTab === 'market' && (
            <div>
              <H3 className={css`color:${textPrimary}!important;margin-bottom:14px!important;`}>Day-Ahead Market Prices — 24h</H3>
              {Object.keys(prices).length === 0 ? (
                <div className={css`background:${cardBg};border:1px solid ${cardBorder};border-radius:10px;padding:40px;text-align:center;`}>
                  <Body className={css`color:${textSecondary}!important;`}>No market price data. Seed demo data first.</Body>
                </div>
              ) : (
                <div className={css`display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px;`}>
                  {Object.entries(prices).map(([zone, zoneData]) => {
                    const latest = zoneData[zoneData.length - 1];
                    const avg = zoneData.reduce((s, d) => s + d.price_eur_mwh, 0) / zoneData.length;
                    const maxP = Math.max(...zoneData.map(d => d.price_eur_mwh));
                    const minP = Math.min(...zoneData.map(d => d.price_eur_mwh));
                    const sparkData = zoneData.map(d => ({ value_mw: d.price_eur_mwh }));
                    return (
                      <div key={zone} className={css`
                        background:${cardBg};border:1px solid ${cardBorder};border-radius:10px;padding:16px;
                      `}>
                        <div className={css`display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;`}>
                          <Body className={css`font-weight:600!important;color:${textPrimary}!important;`}>
                            {zone}
                          </Body>
                          <span className={css`
                            font-size:10px; padding:2px 7px; border-radius:4px;
                            background:rgba(100,150,255,0.1); color:${palette.blue.base};
                            font-family:monospace;
                          `}>DAM</span>
                        </div>
                        <div className={css`display:flex;align-items:baseline;gap:4px;margin:8px 0;`}>
                          <span className={css`font-size:28px;font-weight:700;color:${palette.yellow.base};`}>
                            {latest?.price_eur_mwh.toFixed(1)}
                          </span>
                          <span className={css`font-size:13px;color:${textSecondary};`}>€/MWh</span>
                        </div>
                        <div className={css`margin-bottom:8px;`}>
                          <MiniSparkline data={sparkData} color={palette.yellow.base} />
                        </div>
                        <div className={css`display:flex;justify-content:space-between;`}>
                          <Body className={css`font-size:11px!important;color:${textSecondary}!important;`}>avg {avg.toFixed(1)}</Body>
                          <Body className={css`font-size:11px!important;color:${textSecondary}!important;`}>
                            {minP.toFixed(1)} – {maxP.toFixed(1)} €/MWh
                          </Body>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── RAW vs GOVERNED ── */}
          {activeTab === 'raw' && (
            <div>
              <div className={css`display:flex;align-items:center;gap:8px;margin-bottom:8px;`}>
                <H3 className={css`color:${textPrimary}!important;margin:0!important;`}>Raw MongoDB Document vs ESL-Governed Entity</H3>
              </div>
              <Body className={css`color:${textSecondary}!important;margin-bottom:20px!important;`}>
                The same asset stored in the <code>assets</code> collection — left as raw BSON, right as a typed, governed entity with semantic metadata, resolved relationships, and IEC CIM alignment.
              </Body>

              <div className={css`display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;`}>
                {ENTITY_TYPES.filter(t => t !== 'BiddingZone').map(et => (
                  <button
                    key={et}
                    onClick={() => setActiveEntityType(et)}
                    className={css`
                      padding: 5px 12px; border-radius: 16px; font-size: 12px; cursor: pointer;
                      border: 1px solid ${activeEntityType === et ? palette.green.base : cardBorder};
                      background: ${activeEntityType === et ? palette.green.dark3 : 'transparent'};
                      color: ${activeEntityType === et ? palette.green.light3 : textSecondary};
                      &:hover { border-color: ${palette.green.base}; }
                    `}
                  >{et}</button>
                ))}
              </div>

              <div className={css`display:grid;grid-template-columns:1fr 1fr;gap:16px;`}>
                {/* Raw */}
                <div className={css`background:${cardBg};border:1px solid ${palette.red.dark3};border-radius:10px;overflow:hidden;`}>
                  <div className={css`
                    background:${palette.red.dark3};padding:10px 16px;
                    display:flex;align-items:center;gap:8px;
                  `}>
                    <Icon glyph="CurlyBraces" size={14} fill={palette.red.light3} />
                    <Body className={css`color:${palette.red.light3}!important;font-weight:600!important;font-size:13px!important;`}>
                      Raw BSON — <code>db.assets.findOne()</code>
                    </Body>
                  </div>
                  <pre className={css`
                    padding:16px; margin:0; overflow:auto; max-height:480px;
                    font-size:11px; line-height:1.6;
                    color:${darkMode ? palette.gray.light1 : palette.gray.dark2};
                    font-family:monospace;
                  `}>
                    {rawDocs.length > 0
                      ? JSON.stringify(rawDocs[0], null, 2)
                      : '// No data — seed first'}
                  </pre>
                </div>

                {/* Governed */}
                <div className={css`background:${cardBg};border:1px solid ${palette.green.dark2};border-radius:10px;overflow:hidden;`}>
                  <div className={css`
                    background:${palette.green.dark3};padding:10px 16px;
                    display:flex;align-items:center;gap:8px;
                  `}>
                    <Icon glyph="Diagram3" size={14} fill={palette.green.light3} />
                    <Body className={css`color:${palette.green.light3}!important;font-weight:600!important;font-size:13px!important;`}>
                      ESL-Governed Entity — <code>{activeEntityType}</code>
                    </Body>
                  </div>
                  <pre className={css`
                    padding:16px; margin:0; overflow:auto; max-height:480px;
                    font-size:11px; line-height:1.6;
                    color:${darkMode ? palette.gray.light1 : palette.gray.dark2};
                    font-family:monospace;
                  `}>
                    {entities.length > 0
                      ? JSON.stringify(entities[0], null, 2)
                      : '// No data — seed first'}
                  </pre>
                </div>
              </div>

              {/* YAML manifest */}
              {catalog && catalog.entities[activeEntityType] && (
                <div className={css`margin-top:20px;`}>
                  <Body className={css`color:${textSecondary}!important;margin-bottom:10px!important;font-size:13px!important;`}>
                    Semantic definition that generated this entity — stored in <code>esl/manifests/entities/{activeEntityType.toLowerCase()}.yaml</code>
                  </Body>
                  <div className={css`background:${cardBg};border:1px solid ${cardBorder};border-radius:10px;overflow:hidden;`}>
                    <div className={css`background:${darkMode ? '#1a2a1a' : palette.gray.light2};padding:10px 16px;`}>
                      <Body className={css`font-size:12px!important;color:${palette.green.base}!important;font-family:monospace!important;`}>
                        # ESL Entity Manifest — {activeEntityType}.yaml
                      </Body>
                    </div>
                    <pre className={css`
                      padding:16px; margin:0; overflow:auto; max-height:360px;
                      font-size:11px; line-height:1.7;
                      color:${darkMode ? palette.gray.light1 : palette.gray.dark2};
                      font-family:monospace;
                    `}>
                      {`entity:\n  name: ${activeEntityType}\n  iec_cim_class: ${catalog.entities[activeEntityType].iec_cim_class}\n  description: ${catalog.entities[activeEntityType].description}\n\n  fields:\n${
                        Object.entries(catalog.entities[activeEntityType].fields || {})
                          .map(([f, def]: [string, unknown]) => {
                            const d = def as Record<string, unknown>;
                            return `    ${f}:\n      unit: "${d.unit ?? '—'}"\n      description: "${d.description ?? ''}"${d.required ? '\n      required: true' : ''}`;
                          })
                          .join('\n')
                      }`}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
