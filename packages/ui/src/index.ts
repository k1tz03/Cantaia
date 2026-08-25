// Utility
export { cn } from "./lib/utils";

// Shared components (shadcn/ui will be added via CLI in apps/web, then moved here)
// For now, export custom shared components
export { StatusBadge } from "./components/shared/StatusBadge";
export { PriorityIndicator } from "./components/shared/PriorityIndicator";
export { LanguageSwitcher } from "./components/shared/LanguageSwitcher";

// UI foundation — the shared primitives every feature should build on
export {
  Dialog,
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogTrigger,
} from "./components/ui/Dialog";
export type { DialogProps, DialogSize } from "./components/ui/Dialog";

export { ConfirmDialog } from "./components/ui/ConfirmDialog";
export type { ConfirmDialogProps } from "./components/ui/ConfirmDialog";

export { EmptyState } from "./components/ui/EmptyState";
export type { EmptyStateProps, EmptyStateAction } from "./components/ui/EmptyState";

export { Field, fieldInputClass } from "./components/ui/Field";
export type { FieldProps } from "./components/ui/Field";
