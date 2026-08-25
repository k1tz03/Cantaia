import React from 'react';
import {
  Document, Page, View, Text, Image, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer';
import { C, FONT, SIZE } from './theme';
import {
  DEFAULT_PDF_BRANDING, contrastTextColor, type PdfBranding,
} from './pdf-branding';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PVAction {
  description: string;
  responsible_name?: string;
  responsible_company?: string;
  deadline?: string;
  priority?: string;
  /** Set on points carried over from the previous meeting — "4.2". */
  carried_from?: string | null;
  /** Resolution state of a carried point at the time this PV was written. */
  carried_status?: 'open' | 'in_progress' | 'done' | string;
}

export interface PVSection {
  number?: string | number;
  title?: string;
  content?: string;
  decisions?: string[];
  actions?: PVAction[];
  /** True on the "Points ouverts (séance précédente)" section. */
  carried_over?: boolean;
}

export interface PVParticipant {
  name: string;
  company?: string;
  role?: string;
  present: boolean;
  /** Circulation address — printed so recipients can verify the distribution. */
  email?: string;
}

export interface PVData {
  header?: {
    project_name?: string;
    project_code?: string;
    meeting_number?: string;
    date?: string;
    location?: string;
    next_meeting_date?: string;
    participants?: PVParticipant[];
  };
  sections?: PVSection[];
  summary_fr?: string;
  summary?: string;
}

/** Extra context the document needs beyond the PV content itself. */
export interface PVDocumentOptions {
  /** Org letterhead. Omitted → Cantaia defaults. */
  branding?: PdfBranding;
  /**
   * Days a participant has to oppose the PV after circulation.
   * `null`/`0` hides the mention entirely (some orgs do not use one).
   */
  oppositionDeadlineDays?: number | null;
  /** Hides the two signature lines when the org signs elsewhere. */
  showSignatures?: boolean;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: FONT.regular,
    backgroundColor: C.white,
    paddingBottom: SIZE.footerH + 20,
  },

  // Top bar (colour applied inline from the org accent)
  topBar: {
    height: 4,
  },

  // Letterhead — org logo + name, above the meeting hero
  letterhead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZE.pagePad,
    paddingTop: 18,
    paddingBottom: 2,
    gap: 10,
  },
  letterheadLogo: {
    maxHeight: 34,
    maxWidth: 150,
    objectFit: 'contain',
  },
  letterheadName: {
    fontFamily: FONT.bold,
    fontSize: 12,
    color: C.black,
  },

  // Hero
  hero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    padding: SIZE.pagePad,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  heroLeft: { flex: 1 },
  heroEyebrow: {
    fontFamily: FONT.bold,
    fontSize: 7,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroTitle: {
    fontFamily: FONT.bold,
    fontSize: 22,
    color: C.black,
    marginBottom: 5,
  },
  heroSub: {
    fontFamily: FONT.regular,
    fontSize: 10,
    color: C.medGray,
    lineHeight: 1.5,
  },
  heroBadge: {
    backgroundColor: C.black,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
    marginLeft: 24,
  },
  heroBadgeNum: {
    fontFamily: FONT.bold,
    fontSize: 34,
    lineHeight: 1,
  },
  heroBadgeLabel: {
    fontFamily: FONT.regular,
    fontSize: 7,
    color: '#71717A',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },

  // Meta strip
  metaStrip: {
    flexDirection: 'row',
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  metaCell: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  metaKey: {
    fontFamily: FONT.bold,
    fontSize: 7,
    color: C.lightGray,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  metaVal: {
    fontFamily: FONT.bold,
    fontSize: 11,
    color: C.black,
  },

  // Body
  body: {
    padding: SIZE.pagePad,
    paddingTop: 28,
  },
  section: { marginBottom: 28 },
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

  // Participants grid (2-col)
  participantGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  participantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    padding: 8,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 5,
    marginBottom: 6,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    flexShrink: 0,
  },
  avatarAbsent: { backgroundColor: '#E4E4E7' },
  avatarText: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.white,
  },
  participantName: {
    fontFamily: FONT.bold,
    fontSize: 10,
    color: C.black,
  },
  participantRole: {
    fontFamily: FONT.regular,
    fontSize: 8,
    color: C.medGray,
    marginTop: 1,
  },
  participantStatus: { marginLeft: 'auto' },
  statusPresent: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.green,
  },
  statusAbsent: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.red,
  },

  // Decisions
  decisionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F7F7F7',
    gap: 10,
  },
  decIcon: {
    width: 16,
    height: 16,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  decIconText: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.white,
  },
  decText: {
    fontFamily: FONT.regular,
    fontSize: 11,
    color: C.darkGray,
    lineHeight: 1.6,
    flex: 1,
  },

  // Actions table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.black,
  },
  thAction:  { flex: 3, padding: 7, paddingLeft: 10 },
  thResp:    { flex: 1.5, padding: 7 },
  thDate:    { flex: 1, padding: 7 },
  thPrio:    { flex: 1, padding: 7 },
  thText: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.white,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.faint,
    minHeight: 28,
  },
  tdAction:  { flex: 3, padding: 7, paddingLeft: 10 },
  tdResp:    { flex: 1.5, padding: 7 },
  tdDate:    { flex: 1, padding: 7 },
  tdPrio:    { flex: 1, padding: 7 },
  tdTitle: {
    fontFamily: FONT.bold,
    fontSize: 10,
    color: C.black,
    marginBottom: 2,
  },
  tdSub: {
    fontFamily: FONT.regular,
    fontSize: 8,
    color: C.medGray,
  },
  tdText: {
    fontFamily: FONT.regular,
    fontSize: 10,
    color: C.darkGray,
  },
  dateText: {
    fontFamily: FONT.bold,
    fontSize: 10,
    color: C.black,
  },
  chipUrgent: {
    backgroundColor: C.urgentBg,
    borderWidth: 1,
    borderColor: C.urgentBdr,
    borderRadius: 20,
    paddingVertical: 2,
    paddingHorizontal: 7,
    alignSelf: 'flex-start',
  },
  chipUrgentText: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.amber,
  },
  chipNormal: {
    backgroundColor: C.normalBg,
    borderRadius: 20,
    paddingVertical: 2,
    paddingHorizontal: 7,
    alignSelf: 'flex-start',
  },
  chipNormalText: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.normalClr,
  },

  // Summary box
  summaryBox: {
    padding: 14,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
  },
  summaryText: {
    fontFamily: FONT.regular,
    fontSize: 11,
    color: C.darkGray,
    lineHeight: 1.7,
  },

  // Carried-over points (séance n-1)
  carryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: C.faint,
    gap: 8,
  },
  carryRef: {
    fontFamily: FONT.bold,
    fontSize: 9,
    color: C.medGray,
    width: 34,
    flexShrink: 0,
    marginTop: 1,
  },
  carryBody: { flex: 1 },
  carryDesc: {
    fontFamily: FONT.regular,
    fontSize: 10.5,
    color: C.darkGray,
    lineHeight: 1.5,
  },
  carryMeta: {
    fontFamily: FONT.regular,
    fontSize: 8,
    color: C.medGray,
    marginTop: 2,
  },
  carryChip: {
    borderRadius: 20,
    paddingVertical: 2,
    paddingHorizontal: 7,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  carryChipText: {
    fontFamily: FONT.bold,
    fontSize: 7.5,
  },

  // Opposition notice
  oppositionBox: {
    marginTop: 4,
    marginBottom: 22,
    padding: 11,
    borderLeftWidth: 3,
    backgroundColor: '#FAFAFA',
  },
  oppositionTitle: {
    fontFamily: FONT.bold,
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  oppositionText: {
    fontFamily: FONT.regular,
    fontSize: 9,
    color: C.darkGray,
    lineHeight: 1.55,
  },

  // Signatures
  signatureRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 6,
  },
  signatureCell: { flex: 1 },
  signatureRole: {
    fontFamily: FONT.bold,
    fontSize: 8,
    color: C.medGray,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 34,
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: C.lightGray,
    paddingTop: 5,
  },
  signatureHint: {
    fontFamily: FONT.regular,
    fontSize: 7.5,
    color: C.lightGray,
  },

  // Footer (fixed, appears on every page)
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

function Participant({
  p,
  accent,
  onAccent,
}: {
  p: PVParticipant;
  accent: string;
  /** Text colour that stays readable on `accent` — a pale brand needs black. */
  onAccent: string;
}) {
  return (
    <View style={[s.participantCard, p.present ? {} : { opacity: 0.5 }]}>
      <View style={[s.avatar, p.present ? { backgroundColor: accent } : s.avatarAbsent]}>
        <Text style={[s.avatarText, p.present ? { color: onAccent } : {}]}>
          {initials(p.name)}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.participantName}>{p.name}</Text>
        <Text style={s.participantRole}>
          {[p.role, p.company, p.email].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={s.participantStatus}>
        <Text style={p.present ? s.statusPresent : s.statusAbsent}>
          {p.present ? '● Présent' : '○ Excusé'}
        </Text>
      </View>
    </View>
  );
}

function DecisionItem({
  text,
  accent,
  onAccent,
}: {
  text: string;
  accent: string;
  onAccent: string;
}) {
  return (
    <View style={s.decisionItem}>
      <View style={[s.decIcon, { backgroundColor: accent }]}>
        <Text style={[s.decIconText, { color: onAccent }]}>✓</Text>
      </View>
      <Text style={s.decText}>{text}</Text>
    </View>
  );
}

/** Colour + label for a carried point's resolution state. */
const CARRY_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  open:        { label: 'Ouvert',   bg: C.urgentBg,  fg: C.amber },
  in_progress: { label: 'En cours', bg: C.normalBg,  fg: C.normalClr },
  done:        { label: 'Traité',   bg: C.greenLight, fg: C.green },
};

/**
 * One point inherited from the previous meeting. Rendered as a reference +
 * description + status rather than in the action table: the reader needs to see
 * at a glance what is still hanging, and from which séance.
 */
function CarriedPointRow({ action, isLast }: { action: PVAction; isLast: boolean }) {
  const status = CARRY_STATUS[action.carried_status || 'open'] ?? CARRY_STATUS.open;
  const meta = [
    action.responsible_name,
    action.responsible_company,
    action.deadline ? `délai ${action.deadline}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <View style={[s.carryRow, isLast ? { borderBottomWidth: 0 } : {}]}>
      <Text style={s.carryRef}>{action.carried_from || '—'}</Text>
      <View style={s.carryBody}>
        <Text style={s.carryDesc}>{action.description}</Text>
        {meta ? <Text style={s.carryMeta}>{meta}</Text> : null}
      </View>
      <View style={[s.carryChip, { backgroundColor: status.bg }]}>
        <Text style={[s.carryChipText, { color: status.fg }]}>{status.label}</Text>
      </View>
    </View>
  );
}

function ActionRow({ action, isLast }: { action: PVAction; isLast: boolean }) {
  const urgent = action.priority === 'urgent';
  return (
    <View style={[s.tableRow, isLast ? { borderBottomWidth: 0 } : {}]}>
      <View style={s.tdAction}>
        <Text style={s.tdTitle}>{action.description}</Text>
        {action.responsible_company && (
          <Text style={s.tdSub}>{action.responsible_company}</Text>
        )}
      </View>
      <View style={s.tdResp}>
        <Text style={s.tdText}>{action.responsible_name || '—'}</Text>
      </View>
      <View style={s.tdDate}>
        <Text style={s.dateText}>{action.deadline || '—'}</Text>
      </View>
      <View style={s.tdPrio}>
        {urgent ? (
          <View style={s.chipUrgent}>
            <Text style={s.chipUrgentText}>Urgent</Text>
          </View>
        ) : (
          <View style={s.chipNormal}>
            <Text style={s.chipNormalText}>Normal</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Document component ───────────────────────────────────────────────────────

function PVDocumentComponent({
  pv,
  meta,
  options,
}: {
  pv: PVData;
  meta: { projectName: string; code: string; filename: string };
  options: PVDocumentOptions;
}) {
  const header = pv.header ?? {};
  const sections = pv.sections ?? [];
  const summary = pv.summary_fr ?? pv.summary;
  const participants = header.participants ?? [];
  const num = header.meeting_number ?? '—';

  const branding = options.branding ?? DEFAULT_PDF_BRANDING;
  const accent = branding.primaryColor || DEFAULT_PDF_BRANDING.primaryColor;
  const onAccent = contrastTextColor(accent);
  const oppositionDays = options.oppositionDeadlineDays;
  const showSignatures = options.showSignatures !== false;

  // The carried-over section is rendered on its own, not in the action table:
  // repeating an inherited point among today's actions would double-count it.
  const carrySections = sections.filter(sec => sec.carried_over === true);
  const ownSections = sections.filter(sec => sec.carried_over !== true);

  // Collect all actions from today's sections for the actions table
  const allActions: PVAction[] = [];
  for (const sec of ownSections) {
    if (sec.actions?.length) allActions.push(...sec.actions);
  }

  const footerLeft = `${meta.code} · Séance N°${num}`;
  const footerRight = (
    <Text
      style={s.footerRight}
      render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
    />
  );

  return (
    <Document title={meta.filename} author={branding.name} creator={branding.name}>
      <Page size="A4" style={s.page}>
        {/* Accent top bar — the org's colour, not Cantaia's */}
        <View style={[s.topBar, { backgroundColor: accent }]} />

        {/* Letterhead — the document belongs to the customer, not to Cantaia */}
        <View style={s.letterhead}>
          {branding.logoData ? (
            // @react-pdf's <Image> is not an <img>: it has no `alt` prop, and a
            // PDF carries no accessibility tree here — the org name is repeated
            // in the footer for anyone reading the text layer.
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={s.letterheadLogo} src={branding.logoData} />
          ) : (
            <Text style={s.letterheadName}>{branding.name}</Text>
          )}
        </View>

        {/* Hero */}
        <View style={s.hero}>
          <View style={s.heroLeft}>
            <Text style={[s.heroEyebrow, { color: accent }]}>
              Procès-verbal de séance · N°{num}
            </Text>
            <Text style={s.heroTitle}>{meta.projectName || 'Projet'}</Text>
            <Text style={s.heroSub}>
              {[header.location, header.date].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={s.heroBadge}>
            <Text style={[s.heroBadgeNum, { color: accent }]}>{String(num).padStart(2, '0')}</Text>
            <Text style={s.heroBadgeLabel}>Séance</Text>
          </View>
        </View>

        {/* Meta strip */}
        <View style={s.metaStrip}>
          <View style={s.metaCell}>
            <Text style={s.metaKey}>Code projet</Text>
            <Text style={s.metaVal}>{meta.code || '—'}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaKey}>Date</Text>
            <Text style={s.metaVal}>{header.date || '—'}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaKey}>Prochaine séance</Text>
            <Text style={s.metaVal}>{header.next_meeting_date || '—'}</Text>
          </View>
          <View style={[s.metaCell, { borderRightWidth: 0 }]}>
            <Text style={s.metaKey}>Lieu</Text>
            <Text style={s.metaVal}>{header.location || '—'}</Text>
          </View>
        </View>

        {/* Body */}
        <View style={s.body}>

          {/* Participants */}
          {participants.length > 0 && (
            <View style={s.section}>
              <Text style={s.secLabel}>
                Participants — {participants.filter(p => p.present).length} présents · {participants.filter(p => !p.present).length} excusés
              </Text>
              <View style={s.participantGrid}>
                {participants.map((p, i) => (
                  <Participant key={i} p={p} accent={accent} onAccent={onAccent} />
                ))}
              </View>
            </View>
          )}

          {/* Points carried over from the previous meeting */}
          {carrySections.map((sec, si) => {
            const points = sec.actions ?? [];
            if (points.length === 0) return null;
            const stillOpen = points.filter(p => p.carried_status !== 'done').length;
            return (
              <View key={`carry-${si}`} style={s.section}>
                <Text style={s.secLabel}>
                  {sec.number ? `${sec.number}. ` : ''}{sec.title ?? 'Points ouverts (séance précédente)'}
                  {' '}— {stillOpen} encore ouvert{stillOpen > 1 ? 's' : ''}
                </Text>
                {points.map((p, i) => (
                  <CarriedPointRow key={i} action={p} isLast={i === points.length - 1} />
                ))}
              </View>
            );
          })}

          {/* Decisions from today's sections */}
          {ownSections.some(s => s.decisions?.length) && (
            <View style={s.section}>
              <Text style={s.secLabel}>Décisions actées</Text>
              {ownSections.flatMap(sec =>
                (sec.decisions ?? []).map((d, i) => (
                  <DecisionItem key={`${sec.number}-${i}`} text={d} accent={accent} onAccent={onAccent} />
                ))
              )}
            </View>
          )}

          {/* Content sections */}
          {ownSections.filter(sec => sec.content).map((sec, i) => (
            <View key={i} style={s.section}>
              <Text style={s.secLabel}>
                {sec.number ? `${sec.number}. ` : ''}{sec.title ?? 'Section'}
              </Text>
              <View style={s.summaryBox}>
                <Text style={s.summaryText}>{sec.content}</Text>
              </View>
            </View>
          ))}

          {/* Actions table */}
          {allActions.length > 0 && (
            <View style={s.section}>
              <Text style={s.secLabel}>
                Actions à réaliser — {allActions.length} point{allActions.length > 1 ? 's' : ''} ouvert{allActions.length > 1 ? 's' : ''}
              </Text>
              <View style={s.tableHeader}>
                <View style={s.thAction}><Text style={s.thText}>Action</Text></View>
                <View style={s.thResp}><Text style={s.thText}>Responsable</Text></View>
                <View style={s.thDate}><Text style={s.thText}>Délai</Text></View>
                <View style={s.thPrio}><Text style={s.thText}>Priorité</Text></View>
              </View>
              {allActions.map((a, i) => (
                <ActionRow key={i} action={a} isLast={i === allActions.length - 1} />
              ))}
            </View>
          )}

          {/* Summary */}
          {summary && (
            <View style={s.section}>
              <Text style={s.secLabel}>Résumé</Text>
              <View style={s.summaryBox}>
                <Text style={s.summaryText}>{summary}</Text>
              </View>
            </View>
          )}

          {/* Opposition period — what makes the PV binding once circulated */}
          {typeof oppositionDays === 'number' && oppositionDays > 0 && (
            <View style={[s.oppositionBox, { borderLeftColor: accent }]} wrap={false}>
              <Text style={[s.oppositionTitle, { color: accent }]}>Délai d&apos;opposition</Text>
              <Text style={s.oppositionText}>
                Sauf opposition écrite adressée à {branding.name} dans un délai de {oppositionDays} jour
                {oppositionDays > 1 ? 's' : ''} à compter de l&apos;envoi du présent procès-verbal,
                celui-ci est réputé approuvé par l&apos;ensemble des destinataires.
              </Text>
            </View>
          )}

          {/* Signatures */}
          {showSignatures && (
            <View style={s.section} wrap={false}>
              <Text style={s.secLabel}>Signatures</Text>
              <View style={s.signatureRow}>
                <View style={s.signatureCell}>
                  <Text style={s.signatureRole}>Direction des travaux</Text>
                  <View style={s.signatureLine}>
                    <Text style={s.signatureHint}>Nom, date et signature</Text>
                  </View>
                </View>
                <View style={s.signatureCell}>
                  <Text style={s.signatureRole}>Maître d&apos;ouvrage</Text>
                  <View style={s.signatureLine}>
                    <Text style={s.signatureHint}>Nom, date et signature</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Fixed footer — repeated on every page */}
        <View style={s.footer} fixed>
          <Text style={s.footerSide}>{footerLeft}</Text>
          <Text style={s.footerCenter}>{branding.name}</Text>
          {footerRight}
        </View>
      </Page>
    </Document>
  );
}

// ─── Public helper ────────────────────────────────────────────────────────────

export async function generatePVPdf(
  pv: PVData,
  projectName: string,
  code: string,
  options: PVDocumentOptions = {},
): Promise<Buffer> {
  const meta = {
    projectName,
    code,
    filename: `PV_${(projectName || 'Projet').replace(/\s/g, '_')}_Seance${pv.header?.meeting_number ?? ''}`,
  };
  const element = React.createElement(PVDocumentComponent, { pv, meta, options });
  // renderToBuffer is the stable server-side API (pdf().toBuffer() returns undefined in serverless)
  const buf = await (renderToBuffer as any)(element);
  if (!buf || buf.length === 0) {
    throw new Error("PDF generation returned empty buffer");
  }
  return buf;
}
