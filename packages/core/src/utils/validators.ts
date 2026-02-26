import { z } from "zod";

/**
 * Validate a Swiss phone number (simplified)
 */
export const swissPhoneSchema = z
  .string()
  .regex(
    /^(\+41|0041|0)\s?\d{2}\s?\d{3}\s?\d{2}\s?\d{2}$/,
    "Invalid Swiss phone number"
  );

/**
 * Validate a CFC code (3-digit construction classification)
 */
export const cfcCodeSchema = z
  .string()
  .regex(/^\d{3}$/, "CFC code must be 3 digits");

/**
 * Validate a hex color
 */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color");

/**
 * Validate a project code (alphanumeric + dash, max 20 chars)
 */
export const projectCodeSchema = z
  .string()
  .regex(/^[A-Z0-9-]{1,20}$/, "Project code: uppercase letters, numbers, dashes only");
