import type { Meeting } from "@cantaia/database";
import type { CreateMeetingInput, UpdateMeetingInput } from "../models/meeting";

export interface MeetingServiceInterface {
  getMeetingsByProject(projectId: string): Promise<Meeting[]>;
  getMeetingById(id: string): Promise<Meeting | null>;
  createMeeting(userId: string, data: CreateMeetingInput): Promise<Meeting>;
  updateMeeting(id: string, data: UpdateMeetingInput): Promise<Meeting>;
  generatePV(meetingId: string): Promise<void>;
}
