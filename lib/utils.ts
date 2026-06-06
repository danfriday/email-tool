export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return String(email).trim().toLowerCase();
}

export const generateId = () => Math.random().toString(36).slice(2, 9);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function parseName(raw: string = ''): string {
  return raw
    .trim()
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

export function generateAvatarInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

export function getAvatarColor(name: string): string {
  const colors = ['#4F46E5', '#0891B2', '#059669', '#D97706', '#DC2626', '#7C3AED', '#DB2777'];
  return colors[name.charCodeAt(0) % colors.length];
}
