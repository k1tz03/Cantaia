export interface PVAction {
  description: string;
  responsible_name: string;
  responsible_company: string;
  deadline: string | null;
  priority: "normal" | "urgent";
}

export interface PVSection {
  number: string;
  title: string;
  content: string;
  decisions: string[];
  actions: PVAction[];
}
