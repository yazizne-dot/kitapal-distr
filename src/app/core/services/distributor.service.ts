import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Distributor, DistributorStats } from '../models/distributor';

@Injectable({ providedIn: 'root' })
export class DistributorService {
  readonly distributors = signal<Distributor[]>([]);
  readonly stats = signal<DistributorStats[]>([]);

  async load(): Promise<void> {
    const [d, s] = await Promise.all([
      supabase.from('distributors').select('*').order('id'),
      supabase.from('distributor_stats').select('*').order('distributor_id'),
    ]);
    if (!d.error && d.data) this.distributors.set(d.data as Distributor[]);
    if (!s.error && s.data) this.stats.set(s.data as DistributorStats[]);
  }

  async setDiscount(id: number, discount: number): Promise<string | null> {
    const { error } = await supabase.from('distributors').update({ discount }).eq('id', id);
    if (error) return error.message;
    await this.load();
    return null;
  }
}
