import React from 'react';
import {
  Document, Page, View, Text, StyleSheet, pdf,
} from '@react-pdf/renderer';
import { C, FONT, SIZE } from './theme';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VisiteClientRequest {
  description: string;
  category?: string;
  priority?: string;
  cfc_code?: string;
  details?: string;
}

export interface VisiteMeasurement {
  zone?: string;
  dimensions?: string;
  notes?: string;
}

export interface VisiteData {
  // Visit record fields
  client_name: string;
  client_company?: string;
  client_phone?: string;
  client_email?: string;
  client_address?: string;
  client_postal_code?: string;
  client_city?: string;
  visit_date: string;
  duration_minutes?: number;
  // Report fields
  report?: {
    title?: string;
    summary?: string;
    client_requests?: VisiteClientRequest[];
    measurements?: VisiteMeasurement[];
    constraints?: string[];
    budget?: {
      client_mentioned: boolean;
      range_min?: number;
      range_max?: number;
      currency?: string;
      notes?: string;
    };
    timeline?: {
      desired_start?: string;
      desired_end?: string;
      urgency?: string;
      constraints?: string;
    };
    next_steps?: string[];
    competitors_mentioned?: string[];
    closing_probability?: number;
    sentiment?: string;
    closing_notes?: string;
  };
  // Photos (text references only)
  photos?: Array<{
    photo_type: string;
    caption?: string | null;
    location_description?: string | null;
    ai_transcription?: string | null;
  }>;
  // Org branding
  orgName?: string;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const PRIO_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  high:   { border: C.red,   bg: C.redLight,   text: C.red },
  medium: { border: C.amber, bg: C.amberLight,  text: C.amber },
  low:    { border: C.green, bg: C.greenLight,  text: C.green },
};

const s = StyleSheet.create({
  page: {
    fontFamily: FONT.regular,
    backgroundColor: C.white,
    paddingBottom: SIZE.footerH + 20,
  },
  topBar: {
    height: 4,
    backgroundColor: C.orange,
  },

  // Hero
  hero: {
    padding: SIZE.pagePad,
    paddingTop: 28,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  heroType: {
    fontFamily: FONT.bold,
    fontSize: 7,
    color: C.orange,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroTitle: {
    fontFamily: FONT.bold,
    fontSize: 24,
    color: C.black,
    marginBottom: 5,
  },
  heroSub: {
    fontFamily: FONT.regular,
    fontSize: 10,
    color: C.medGray,
  },

  // KPI strip
  kpiStrip: {
    flexDirection: 'row',
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  kpiBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  kpiVal: {
    fontFamily: FONT.bold,
    fontSize: 22,
    lineHeight: 1,
    marginBottom: 3,
  },
  kpiKey: {
    fontFamily: FONT.regular,
    fontSize: 7,
    color: C.lightGray,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  // Body
  body: {
    padding: SIZE.pagePad,
    paddingTop: 28,
  },
  section: { marginBottom: 24 },
  secLabel: {
    fontFamily: FONT.bold,
    fontSize: 7,
    color: C.lightGray,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  // Summary
  summaryBox: {
    padding: 14,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
  },
  summaryText: {
    fontFamily: FONT.regular,
    fontSize: 12,
    color: C.darkGray,
    lineHeight: 1.8,
  },

  // Requests
  requestItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.faint,
  },
  requestAccent: {
    width: 3,
    borderRadius: 2,
    marginRight: 14,
    flexShrink: 0,
  },
  requestBody: { flex: 1 },
  requestName: {
    fontFamily: FONT.bold,
    fontSize: 12,
    color: C.black,
    marginBottom: 3,
  },
  requestDetail: {
    fontFamily: FONT.regular,
    fontSize: 10,
    color: C.medGray,
    lineHeight: 1.5,
  },
  requestSide: {
    alignItems: 'flex-end',
    gap: 4,
    paddingLeft: 12,
    flexShrink: 0,
  },
  cfcChip: {
    backgroundColor: C.faint,
    borderRadius: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  cfcText: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.lightGray,
  },
  prioText: {
    fontFamily: FONT.bold,
    fontSize: 9,
  },

  // Measurements
  measureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.faint,
  },
  measureZone: {
    width: 120,
    fontFamily: FONT.bold,
    fontSize: 10,
    color: C.black,
  },
  measureDim: {
    width: 80,
    fontFamily: FONT.bold,
    fontSize: 13,
    color: C.orange,
  },
  measureNote: {
    flex: 1,
    fontFamily: FONT.regular,
    fontSize: 9,
    color: C.lightGray,
  },

  // Constraints
  constraintItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    backgroundColor: C.amberLight,
    borderLeftWidth: 2,
    borderLeftColor: C.amber,
    borderRadius: 4,
    marginBottom: 6,
    gap: 8,
  },
  constraintIcon: {
    fontFamily: FONT.bold,
    fontSize: 10,
    color: C.amber,
    flexShrink: 0,
    marginTop: 1,
  },
  constraintText: {
    fontFamily: FONT.regular,
    fontSize: 10,
    color: '#78350F',
    lineHeight: 1.5,
    flex: 1,
  },

  // Next steps
  stepItem: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 5,
    alignItems: 'flex-start',
  },
  stepArrow: {
    fontFamily: FONT.bold,
    fontSize: 10,
    color: C.orange,
    flexShrink: 0,
    marginTop: 1,
  },
  stepText: {
    fontFamily: FONT.regular,
    fontSize: 11,
    color: C.darkGray,
    flex: 1,
    lineHeight: 1.5,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: SIZE.pagePad,
    right: SIZE.pagePad,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  footerSide: {
    fontFamily: FONT.regular,
    fontSize: 8,
    color: C.lightGray,
    width: 130,
  },
  footerCenter: {
    fontFamily: FONT.bold,
    fontSize: 9,
    color: C.black,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textAlign: 'center',
    flex: 1,
  },
  footerRight: {
    fontFamily: FONT.regular,
    fontSize: 8,
    color: C.lightGray,
    textAlign: 'right',
    width: 130,
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('fr-CH', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatCHF(n: number): string {
  return n.toLocaleString('fr-CH');
}

const PRIO_ORDER = ['high', 'medium', 'low'] as const;
const PRIO_LABELS: Record<string, string> = { high: '● Haute', medium: '● Moyenne', low: '● Basse' };
const URGENCY_LABELS: Record<string, string> = { low: 'Basse', moderate: 'Modérée', high: 'Haute', critical: 'Critique' };
const SENTIMENT_LABELS: Record<string, string> = { positive: '😊 Positif', neutral: '😐 Neutre', hesitant: '🤔 Hésitant', negative: '😟 Négatif' };

// ─── Document component ───────────────────────────────────────────────────────

function VisiteDocumentComponent({ data }: { data: VisiteData }) {
  const report = data.report ?? {};
  const requests = report.client_requests ?? [];
  const measurements = report.measurements ?? [];
  const constraints = report.constraints ?? [];
  const nextSteps = report.next_steps ?? [];

  const closingPct = report.closing_probability != null
    ? `${Math.round(report.closing_probability * 100)}%`
    : '—';

  const budgetStr = report.budget?.client_mentioned && report.budget.range_min
    ? `CHF ${formatCHF(report.budget.range_min)}${report.budget.range_max ? ` – ${formatCHF(report.budget.range_max)}` : ''}`
    : '—';

  const clientAddr = [data.client_address, data.client_postal_code, data.client_city]
    .filter(Boolean).join(', ');

  const footerLeft = `Visite du ${formatDate(data.visit_date)} · ${data.client_name}`;

  return (
    <Document title={`Rapport-Visite-${data.client_name}`} author="Cantaia" creator="cantaia.io">
      <Page size="A4" style={s.page}>
        {/* Orange top bar */}
        <View style={s.topBar} />

        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.heroType}>Rapport de visite client</Text>
          <Text style={s.heroTitle}>{data.client_name}</Text>
          <Text style={s.heroSub}>
            {[clientAddr, formatDate(data.visit_date)].filter(Boolean).join(' · ')}
            {data.duration_minutes ? ` · ${data.duration_minutes} min` : ''}
          </Text>
        </View>

        {/* KPI strip */}
        <View style={s.kpiStrip}>
          <View style={s.kpiBox}>
            <Text style={[s.kpiVal, { color: C.green }]}>{closingPct}</Text>
            <Text style={s.kpiKey}>Prob. de clôture</Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={[s.kpiVal, { color: C.orange, fontSize: 16 }]}>{budgetStr}</Text>
            <Text style={s.kpiKey}>Budget estimé</Text>
          </View>
          <View style={[s.kpiBox, { borderRightWidth: 0 }]}>
            <Text style={[s.kpiVal, { color: '#2563EB', fontSize: 14 }]}>
              {report.timeline?.desired_start ?? (report.timeline?.urgency ? URGENCY_LABELS[report.timeline.urgency] ?? '—' : '—')}
            </Text>
            <Text style={s.kpiKey}>Début souhaité</Text>
          </View>
        </View>

        <View style={s.body}>

          {/* Summary */}
          {report.summary && (
            <View style={s.section}>
              <Text style={s.secLabel}>Résumé de la visite</Text>
              <View style={s.summaryBox}>
                <Text style={s.summaryText}>{report.summary}</Text>
              </View>
            </View>
          )}

          {/* Requests */}
          {requests.length > 0 && (
            <View style={s.section}>
              <Text style={s.secLabel}>
                Demandes identifiées — {requests.length} poste{requests.length > 1 ? 's' : ''} · par priorité décroissante
              </Text>
              {PRIO_ORDER.flatMap(prio => {
                const items = requests.filter(r => r.priority === prio);
                return items.map((req, i) => {
                  const pc = PRIO_COLORS[prio] ?? PRIO_COLORS.low;
                  const isLast = i === items.length - 1 && prio === PRIO_ORDER[PRIO_ORDER.length - 1];
                  return (
                    <View key={`${prio}-${i}`} style={[s.requestItem, isLast ? { borderBottomWidth: 0 } : {}]}>
                      <View style={[s.requestAccent, { backgroundColor: pc.border }]} />
                      <View style={s.requestBody}>
                        <Text style={s.requestName}>{req.description}</Text>
                        {req.details && <Text style={s.requestDetail}>{req.details}</Text>}
                      </View>
                      <View style={s.requestSide}>
                        {req.cfc_code && (
                          <View style={s.cfcChip}>
                            <Text style={s.cfcText}>CFC {req.cfc_code}</Text>
                          </View>
                        )}
                        <Text style={[s.prioText, { color: pc.text }]}>
                          {PRIO_LABELS[prio]}
                        </Text>
                      </View>
                    </View>
                  );
                });
              })}
            </View>
          )}

          {/* Measurements */}
          {measurements.length > 0 && (
            <View style={s.section}>
              <Text style={s.secLabel}>Métrés relevés sur place</Text>
              {measurements.map((m, i) => (
                <View key={i} style={[s.measureRow, i === measurements.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                  <Text style={s.measureZone}>{m.zone ?? '—'}</Text>
                  <Text style={s.measureDim}>{m.dimensions ?? '—'}</Text>
                  <Text style={s.measureNote}>{m.notes ?? ''}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Constraints */}
          {constraints.length > 0 && (
            <View style={s.section}>
              <Text style={s.secLabel}>Contraintes identifiées</Text>
              {constraints.map((c, i) => (
                <View key={i} style={s.constraintItem}>
                  <Text style={s.constraintIcon}>⚠</Text>
                  <Text style={s.constraintText}>{c}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Next steps */}
          {nextSteps.length > 0 && (
            <View style={s.section}>
              <Text style={s.secLabel}>Prochaines étapes</Text>
              {nextSteps.map((step, i) => (
                <View key={i} style={s.stepItem}>
                  <Text style={s.stepArrow}>→</Text>
                  <Text style={s.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          )}

          {/* AI Analysis */}
          {(report.closing_probability != null || report.sentiment) && (
            <View style={s.section}>
              <Text style={s.secLabel}>Analyse IA</Text>
              <View style={s.summaryBox}>
                {report.closing_probability != null && (
                  <Text style={[s.summaryText, { marginBottom: 4 }]}>
                    {'Probabilité de signature : '}
                    <Text style={{
                      color: report.closing_probability >= 0.7 ? C.green
                        : report.closing_probability >= 0.4 ? C.amber : C.red,
                      fontFamily: FONT.bold,
                    }}>
                      {Math.round(report.closing_probability * 100)}%
                    </Text>
                  </Text>
                )}
                {report.sentiment && (
                  <Text style={[s.summaryText, { marginBottom: 4 }]}>
                    {'Sentiment : '}
                    <Text style={{ fontFamily: FONT.bold }}>
                      {SENTIMENT_LABELS[report.sentiment] ?? report.sentiment}
                    </Text>
                  </Text>
                )}
                {report.closing_notes && (
                  <Text style={[s.summaryText, { color: C.medGray, fontFamily: FONT.oblique }]}>
                    {report.closing_notes}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Budget */}
          {report.budget?.client_mentioned && (
            <View style={s.section}>
              <Text style={s.secLabel}>Budget mentionné</Text>
              <View style={s.summaryBox}>
                <Text style={[s.summaryText, { marginBottom: report.budget.notes ? 6 : 0 }]}>
                  {'Fourchette : '}
                  <Text style={{ fontFamily: FONT.bold, color: C.orange }}>{budgetStr}</Text>
                </Text>
                {report.budget.notes && (
                  <Text style={[s.summaryText, { color: C.medGray, fontFamily: FONT.oblique }]}>
                    &ldquo;{report.budget.notes}&rdquo;
                  </Text>
                )}
              </View>
            </View>
          )}

        </View>

        {/* Fixed footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerSide}>{footerLeft}</Text>
          <Text style={s.footerCenter}>cantaia.io</Text>
          <Text
            style={s.footerRight}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

// ─── Public helper ────────────────────────────────────────────────────────────

export async function generateVisitePdf(data: VisiteData): Promise<ArrayBuffer> {
  const element = React.createElement(VisiteDocumentComponent, { data });
  // pdf() is typed for top-level <Document> elements; our component renders one, cast to bypass
  const buf: Buffer = await (pdf as any)(element).toBuffer();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
