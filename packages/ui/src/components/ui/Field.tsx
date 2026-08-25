"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface FieldProps {
  label: React.ReactNode;
  /** Explicit id. Omit it and one is generated, then wired to the control. */
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  /**
   * The control. If given as a render prop it receives the resolved ids,
   * which is the reliable way to label a custom/3rd-party input.
   */
  children:
    | React.ReactNode
    | ((ids: { id: string; describedBy: string | undefined }) => React.ReactNode);
}

/**
 * Labelled form field. Generates an id with `useId` and links it to the
 * control, so every input gets a real <label for> plus aria-describedby
 * for its hint / error text without each call site inventing ids.
 *
 * A single React element child is cloned with the id automatically;
 * anything more complex should use the render-prop form.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  const generatedId = React.useId();
  const id = htmlFor ?? `field-${generatedId}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  let control: React.ReactNode;
  if (typeof children === "function") {
    control = children({ id, describedBy });
  } else if (React.isValidElement(children)) {
    const child = children as React.ReactElement<Record<string, unknown>>;
    control = React.cloneElement(child, {
      id: (child.props.id as string | undefined) ?? id,
      "aria-describedby":
        (child.props["aria-describedby"] as string | undefined) ?? describedBy,
      "aria-invalid": error ? true : child.props["aria-invalid"],
      ...(required ? { required: child.props.required ?? true } : {}),
    });
  } else {
    control = children;
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className="text-[12px] font-medium text-[#D4D4D8]"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-[#EF4444]" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {control}
      {error ? (
        <p id={errorId} role="alert" className="text-[11px] text-[#EF4444]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[11px] text-[#A1A1AA]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Shared input skin so form controls stop drifting apart. */
export const fieldInputClass =
  "w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-[13px] text-[#FAFAFA] placeholder:text-[#71717A] transition-colors focus:border-[#F97316] focus:outline-none disabled:opacity-60";
