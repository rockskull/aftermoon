/** Sheet `status` values that are allowed to reach the public site. */
export type PublicEventStatus = "published" | "closed" | "canceled";
export type PublicEnrollmentStatus = "published" | "closed";

/** What visitors see; derived from the sheet status plus dates (see status.ts). */
export type EventDisplayStatus = "COMING_SOON" | "OPEN" | "CLOSED" | "FINISHED" | "CANCELED";
export type EnrollmentDisplayStatus = "COMING_SOON" | "OPEN" | "CLOSED";

export interface ClubEvent {
  id: string;
  title: string;
  /** Short label for calendar cells; falls back to the title. */
  shortTitle: string;
  description: string;
  category: string | null;
  /** Epoch ms. */
  start: number;
  /** Epoch ms, exclusive. null = ends with the start day. */
  end: number | null;
  /** start_at had no time (all-day event). */
  allDay: boolean;
  /** Epoch ms. null = registration open since the event was published. */
  registrationOpen: number | null;
  /** Epoch ms, exclusive. null = registration closes when the event starts. */
  registrationClose: number | null;
  capacity: number | null;
  /** Publicly announced fee, already formatted ("10,000원", "무료"). Never the proposer's wish. */
  fee: string | null;
  registrationUrl: string | null;
  host: string | null;
  audience: string | null;
  location: string | null;
  /** 준비물 및 안내 */
  notes: string | null;
  status: PublicEventStatus;
}

export interface Enrollment {
  id: string;
  title: string;
  description: string;
  /** Seoul day keys, both inclusive. */
  startDate: string;
  endDate: string;
  applicationUrl: string | null;
  status: PublicEnrollmentStatus;
}

export type ClubDataSource = "sheets" | "sample" | "error";

export interface ClubData {
  source: ClubDataSource;
  events: ClubEvent[];
  enrollments: Enrollment[];
}
