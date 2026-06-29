// Shared constants for the "already registered" reminder flow.
// The reminder send targets exactly this app-managed list, using the dedicated
// `reminder` email template (see lib/emailTemplate.ts) — keeping it separate
// from the main "send invite to all contacts" flow.

export const REMINDER_LIST_NAME = 'Praise Party Reminder';
export const REMINDER_TEMPLATE_NAME = 'reminder';
// Post-event "thank you for coming" send, reusing the same registrants list.
export const THANK_YOU_TEMPLATE_NAME = 'thank-you';

// Templates that may be sent to the registrants (reminder) list. The send route
// only accepts one of these; anything else falls back to the reminder template.
export const REMINDER_LIST_TEMPLATES = [
  REMINDER_TEMPLATE_NAME,
  THANK_YOU_TEMPLATE_NAME,
] as const;

export type ReminderListTemplate = (typeof REMINDER_LIST_TEMPLATES)[number];

// Human label per template, used for campaign names and toasts.
export const REMINDER_TEMPLATE_LABELS: Record<ReminderListTemplate, string> = {
  [REMINDER_TEMPLATE_NAME]: 'Reminder',
  [THANK_YOU_TEMPLATE_NAME]: 'Thank-you',
};
