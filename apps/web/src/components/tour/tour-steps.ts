export interface TourStep {
  id: string;
  target: string; // data-tour="xxx" selector
  titleKey: string; // i18n key under "tour"
  descriptionKey: string; // i18n key under "tour"
  placement: "top" | "bottom" | "left" | "right";
  page?: string; // if set, navigate to this page before showing step
  spotlightPadding?: number;
}

export const TOUR_STEPS: TourStep[] = [
  { id: "mail-nav", target: '[data-tour="nav-mail"]', titleKey: "mail.title", descriptionKey: "mail.description", placement: "right", page: "/mail" },
  { id: "mail-buckets", target: '[data-tour="mail-buckets"]', titleKey: "mailBuckets.title", descriptionKey: "mailBuckets.description", placement: "bottom", page: "/mail" },
  { id: "mail-detail", target: '[data-tour="mail-detail"]', titleKey: "mailDetail.title", descriptionKey: "mailDetail.description", placement: "left", page: "/mail" },
  { id: "dashboard-nav", target: '[data-tour="nav-dashboard"]', titleKey: "dashboard.title", descriptionKey: "dashboard.description", placement: "right", page: "/dashboard" },
  { id: "tasks-nav", target: '[data-tour="nav-tasks"]', titleKey: "tasks.title", descriptionKey: "tasks.description", placement: "right", page: "/tasks" },
  { id: "projects-nav", target: '[data-tour="nav-projects"]', titleKey: "projects.title", descriptionKey: "projects.description", placement: "right", page: "/projects" },
  { id: "submissions-nav", target: '[data-tour="nav-submissions"]', titleKey: "submissions.title", descriptionKey: "submissions.description", placement: "right", page: "/submissions" },
  { id: "suppliers-nav", target: '[data-tour="nav-suppliers"]', titleKey: "suppliers.title", descriptionKey: "suppliers.description", placement: "right", page: "/suppliers" },
  { id: "plans-nav", target: '[data-tour="nav-plans"]', titleKey: "plans.title", descriptionKey: "plans.description", placement: "right", page: "/plans" },
  { id: "chat-nav", target: '[data-tour="nav-chat"]', titleKey: "chat.title", descriptionKey: "chat.description", placement: "right", page: "/chat" },
  { id: "header-search", target: '[data-tour="header-search"]', titleKey: "search.title", descriptionKey: "search.description", placement: "bottom" },
  { id: "support-nav", target: '[data-tour="nav-support"]', titleKey: "support.title", descriptionKey: "support.description", placement: "right" },
  { id: "completion", target: '[data-tour="nav-mail"]', titleKey: "completion.title", descriptionKey: "completion.description", placement: "right" },
];
