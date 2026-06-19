// Shared domain types used across the app, API layer and services.

export type ContactStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'bounced';

export interface Contact {
  id: string;
  name: string;
  email: string;
  suppressed: boolean;
  suppressedReason?: string | null;
  createdAt: number;
  updatedAt: number;
  // UI-only convenience fields (never persisted)
  selected?: boolean;
  lists?: string[];
}

export interface ContactList {
  id: string;
  name: string;
  description?: string | null;
  contactCount?: number;
  createdAt: number;
  updatedAt: number;
}

export type CampaignStatus =
  | 'draft' | 'scheduled' | 'queued' | 'processing'
  | 'paused' | 'completed' | 'cancelled';

export interface Campaign {
  id: string;
  name: string;
  templateName: string;
  fromName: string;
  fromEmail: string;
  flyerImageUrl?: string | null;
  status: CampaignStatus;
  scheduledAt?: number | null;
  totalRecipients: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number | null;
  completedAt?: number | null;
}

export interface CampaignProgress {
  id: string;
  name: string;
  status: CampaignStatus;
  templateName: string;
  fromName: string;
  fromEmail: string;
  scheduledAt?: number | null;
  createdAt: number;
  startedAt?: number | null;
  completedAt?: number | null;
  totalRecipients: number;
  jobCount: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  completionPct: number;
}

export type JobStatus =
  | 'queued' | 'processing' | 'sent' | 'failed'
  | 'retrying' | 'skipped' | 'cancelled';

export interface ActivityLog {
  id: string;
  type: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown> | null;
  campaignId?: string | null;
  contactId?: string | null;
  actor?: string | null;
  createdAt: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Recipient selection accepted by the campaign-enqueue endpoint. */
export interface RecipientSelection {
  contactIds?: string[];
  listIds?: string[];
  allContacts?: boolean;
}
