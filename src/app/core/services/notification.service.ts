import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { AppNotif } from '../models/notification';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly notifications = signal<AppNotif[]>([]);

  async load(): Promise<void> {
    const { data, error } = await supabase
      .from('notifications').select('*').order('date', { ascending: false });
    if (!error && data) this.notifications.set(data as AppNotif[]);
  }
}
