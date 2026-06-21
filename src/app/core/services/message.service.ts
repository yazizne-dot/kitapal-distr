import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { DistMessage } from '../models/message';

@Injectable({ providedIn: 'root' })
export class MessageService {
  readonly messages = signal<DistMessage[]>([]);

  async load(): Promise<void> {
    const { data, error } = await supabase
      .from('messages').select('*').order('created_at', { ascending: false });
    if (!error && data) this.messages.set(data as DistMessage[]);
  }

  async send(distributorId: number, body: string): Promise<string | null> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('messages')
      .insert({ distributor_id: distributorId, body, from_profile_id: auth.user?.id ?? null });
    if (error) return error.message;
    await this.load();
    return null;
  }
}
