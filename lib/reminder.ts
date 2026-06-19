// Shared constants for the "already registered" reminder flow.
// The reminder send targets exactly this app-managed list, using the dedicated
// `reminder` email template (see lib/emailTemplate.ts) — keeping it separate
// from the main "send invite to all contacts" flow.

export const REMINDER_LIST_NAME = 'Praise Party Reminder';
export const REMINDER_TEMPLATE_NAME = 'reminder';
