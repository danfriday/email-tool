export interface Contact {
  id?: string;
  name: string;
  email: string;
  status?: 'pending' | 'sending' | 'sent' | 'failed' | 'bounced';
  sentAt?: number;
  createdAt: number;
  selected?: boolean;
}
