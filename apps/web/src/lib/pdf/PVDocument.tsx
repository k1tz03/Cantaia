import React from 'react';
import {
  Document, Page, View, Text, StyleSheet, pdf,
} from '@react-pdf/renderer';
import { C, FONT, SIZE } from './theme';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PVAction {
  description: string;
  responsible_name?: string;
  responsible_company?: string;
  deadline?: string;
  priority?: string;
}

export interface PVSection {
  number?: string | number;
  title?: string;
  content?: string;
  decisions?: string[];
  actions?: PVAction[];
}

export interface PVParticipant {
  name: string;
  company?: string;
  role?: string;
  present: boolean;
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: FONT.regular,
    backgroundColor: C.white,
    paddingBottom: SIZE.footerH + 20,
  },

  // Top bar
  topBar: {
    height: 4,
    backgroundColor: C.orange,
  },

  // Hero
  hero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    padding: SIZE.pagePad,
    paddingTop: 28,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  heroLeft: { flex: 1 },
  heroEyebrow: {
    fontFamily: FONT.bold,
    fontSize: 7,
    color: C.orange,
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
    color: C.orange,
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
    backgroundColor: C.orange,
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

function Participant({ p }: { p: PVParticipant }) {
  return (
    <View style={[s.participantCard, p.present ? {} : { opacity: 0.5 }]}>
      <View style={[s.avatar, p.present ? {} : s.avatarAbsent]}>
        <Text style={s.avatarText}>{initials(p.name)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.participantName}>{p.name}</Text>
        <Text style={s.participantRole}>
          {[p.role, p.company].filter(Boolean).join(' · ')}
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

function DecisionItem({ text }: { text: string }) {
  return (
    <View style={s.decisionItem}>
      <View style={s.decIcon}>
        <Text style={s.decIconText}>✓</Text>
      </View>
      <Text style={s.decText}>{text}</Text>
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

function PVDocumentComponent({ pv, meta }: { pv: PVData; meta: { projectName: string; code: string; filename: string } }) {
  const header = pv.header ?? {};
  const sections = pv.sections ?? [];
  const summary = pv.summary_fr ?? pv.summary;
  const participants = header.participants ?? [];
  const num = header.meeting_number ?? '—';

  // Collect all actions from all sections for the actions table
  const allActions: PVAction[] = [];
  for (const sec of sections) {
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
    <Document title={meta.filename} author="Cantaia" creator="cantaia.io">
      <Page size="A4" style={s.page}>
        {/* Orange top bar */}
        <View style={s.topBar} />

        {/* Hero */}
        <View style={s.hero}>
          <View style={s.heroLeft}>
            <Text style={s.heroEyebrow}>
              Procès-verbal de séance · N°{num}
            </Text>
            <Text style={s.heroTitle}>{meta.projectName || 'Projet'}</Text>
            <Text style={s.heroSub}>
              {[header.location, header.date].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={s.heroBadge}>
            <Text style={s.heroBadgeNum}>{String(num).padStart(2, '0')}</Text>
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
                  <Participant key={i} p={p} />
                ))}
              </View>
            </View>
          )}

          {/* Decisions from all sections */}
          {sections.some(s => s.decisions?.length) && (
            <View style={s.section}>
              <Text style={s.secLabel}>Décisions actées</Text>
              {sections.flatMap(sec =>
                (sec.decisions ?? []).map((d, i) => <DecisionItem key={`${sec.number}-${i}`} text={d} />)
              )}
            </View>
          )}

          {/* Content sections */}
          {sections.filter(sec => sec.content).map((sec, i) => (
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
        </View>

        {/* Fixed footer — repeated on every page */}
        <View style={s.footer} fixed>
          <Text style={s.footerSide}>{footerLeft}</Text>
          <Text style={s.footerCenter}>cantaia.io</Text>
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
): Promise<ArrayBuffer> {
  const meta = {
    projectName,
    code,
    filename: `PV_${(projectName || 'Projet').replace(/\s/g, '_')}_Seance${pv.header?.meeting_number ?? ''}`,
  };
  const element = React.createElement(PVDocumentComponent, { pv, meta });
  // pdf() is typed for top-level <Document> elements; our component renders one, cast to bypass
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf: Buffer = await (pdf as any)(element).toBuffer();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
