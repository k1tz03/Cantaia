export interface PVAction {
  description: string;
  responsible_name: string;
  responsible_company: string;
  deadline: string | null;
  priority: "normal" | "urgent";
  /**
   * Set on points inherited from the previous séance — holds the number they
   * carried there (e.g. "4.2"), so the reference stays traceable across PVs.
   */
  carried_from?: string | null;
  /** Resolution state of a carried point, editable by the conducteur. */
  carried_status?: CarriedStatus;
}

export type CarriedStatus = "open" | "in_progress" | "done";

export interface PVSection {
  /**
   * Persistent point number, `{meeting_number}.{index}`. Assigned once and
   * never recomputed: deleting a section must not renumber the ones below it,
   * or a point referenced as "4.3" in the previous PV would silently move.
   */
  number: string;
  title: string;
  content: string;
  decisions: string[];
  actions: PVAction[];
  /** True on the auto-generated "Points ouverts (séance précédente)" section. */
  carried_over?: boolean;
}

export interface PVParticipant {
  name: string;
  company: string;
  role: string;
  present: boolean;
  /** Circulation address — drives the recipient list of the send modal. */
  email?: string;
}

/** One section of the org's PV outline (`organizations.pv_template`). */
export interface PVTemplateSection {
  titre: string;
  ordre: number;
  obligatoire: boolean;
}
