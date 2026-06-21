import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Payment } from '../models/payment';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  readonly payments = signal<Payment[]>([]);

  async load(): Promise<void> {
    const { data, error } = await supabase
      .from('payments').select('*').order('paid_at', { ascending: false });
    if (!error && data) this.payments.set(data as Payment[]);
  }

  async add(distributorId: number, amount: number, paidAt: string, note: string): Promise<string | null> {
    const { error } = await supabase.from('payments')
      .insert({ distributor_id: distributorId, amount, paid_at: paidAt, note });
    if (error) return error.message;
    await this.load();
    return null;
  }

  async remove(id: number): Promise<void> {
    await supabase.from('payments').delete().eq('id', id);
    await this.load();
  }
}
