export interface Contact {
  id?: string;
  name: string;
  email: string;
  status?: 'pending' | 'sent' | 'failed';
  sentAt?: number;
  createdAt: number;
  selected?: boolean;
}
