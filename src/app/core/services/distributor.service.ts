import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Distributor, DistributorStats } from '../models/distributor';

export interface CreateDistributorInput {
  company: string;
  city: string;
  discount: number;
  creditLimit: number;
  target: number;
  openingDebt: number;
  phone: string;
}

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

  async createWithOpeningBalance(input: CreateDistributorInput): Promise<number | string> {
    const { data: existing, error: existingError } = await supabase
      .from('distributors')
      .select('id')
      .eq('company', input.company)
      .eq('city', input.city)
      .maybeSingle();
    if (existingError) return existingError.message;
    if (existing?.id) return 'Дистрибьютор осындай компания және қала бойынша бұрыннан бар';

    const { data: distributor, error: distributorError } = await supabase
      .from('distributors').insert({
        company: input.company,
        city: input.city,
        discount: input.discount,
        credit_limit: input.creditLimit,
        phone: input.phone,
      })
      .select('id')
      .single();
    if (distributorError || !distributor) return distributorError?.message ?? 'distributor insert failed';

    const distributorId = Number(distributor.id);
    const { error: targetError } = await supabase
      .from('targets').upsert({
        distributor_id: distributorId,
        period: this.currentHalfYear(),
        amount: input.target,
      }, { onConflict: 'distributor_id,period' });
    if (targetError) return targetError.message;

    if (input.openingDebt > 0) {
      const productId = await this.ensureOpeningBalanceProduct();
      if (typeof productId === 'string') return productId;

      const { data: order, error: orderError } = await supabase
        .from('orders').insert({
          distributor_id: distributorId,
          status: 'confirmed',
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (orderError || !order) return orderError?.message ?? 'opening debt order insert failed';

      const { error: itemError } = await supabase.from('order_items').insert({
        order_id: order.id,
        product_id: productId,
        qty: input.openingDebt,
        unit_price: 1,
        discount: 0,
      });
      if (itemError) return itemError.message;
    }

    await this.load();
    return distributorId;
  }

  private currentHalfYear(): string {
    const now = new Date();
    const half = now.getMonth() <= 5 ? 'H1' : 'H2';
    return `${now.getFullYear()}-${half}`;
  }

  private async ensureOpeningBalanceProduct(): Promise<number | string> {
    const { data: existing, error: selectError } = await supabase
      .from('products')
      .select('id')
      .eq('barcode', 'OPENING-BALANCE')
      .maybeSingle();
    if (selectError) return selectError.message;
    if (existing?.id) return Number(existing.id);

    const { data: created, error: insertError } = await supabase
      .from('products')
      .insert({
        name: 'Бастапқы сальдо (opening balance)',
        barcode: 'OPENING-BALANCE',
        publisher: 'system',
        category: 'system',
        base_price: 1,
      })
      .select('id')
      .single();
    if (insertError || !created) return insertError?.message ?? 'opening balance product insert failed';
    return Number(created.id);
  }
}
