import { z } from "zod";

export const meetingStatusSchema = z.enum([
  "scheduled",
  "recording",
  "transcribing",
  "generating_pv",
  "review",
  "finalized",
  "sent",
]);

export const meetingParticipantSchema = z.object({
  name: z.string().min(1),
  company: z.string().min(1),
  role: z.string(),
  email: z.string().email().nullable().default(null),
  present: z.boolean(),
});

export const createMeetingSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1).max(300),
  meeting_number: z.number().int().positive().optional(),
  meeting_date: z.string(),
  location: z.string().max(300).optional(),
  planned_duration_minutes: z.number().int().positive().optional(),
  agenda: z.array(z.string()).default([]),
  participants: z.array(meetingParticipantSchema).default([]),
});

export const updateMeetingSchema = createMeetingSchema.partial();

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;
export type MeetingParticipantInput = z.infer<typeof meetingParticipantSchema>;
