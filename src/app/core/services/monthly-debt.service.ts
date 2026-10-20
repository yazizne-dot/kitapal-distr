import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';

export interface MonthlyDebt {
  distributor_id: number;
  opening_debt: number;
  paid: number;
  debt: number;
  credit_limit: number;
}

@Injectable({ providedIn: 'root' })
export class MonthlyDebtService {
  readonly rows = signal<MonthlyDebt[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  private request = 0;

  async setOpeningDebt(distributorId: number, month: string, amount: number, expectedAmount: number): Promise<string | null> {
    if (!Number.isFinite(amount) || Math.abs(amount) > 999999999999.99 || !Number.isFinite(expectedAmount)) {
      return 'Қарыз сомасын дұрыс енгізіңіз.';
    }
    try {
      const { error } = await supabase.rpc('set_month_opening_debt', {
        p_distributor_id: distributorId, p_month: `${month}-01`,
        p_amount: Math.round(amount * 100) / 100, p_expected_amount: expectedAmount,
      });
      return error ? 'Қарыз сақталмады. Деректерді жаңартып, рұқсат пен SQL жаңартуын тексеріңіз.' : null;
    } catch {
      return 'Қарыз сақталмады. Байланысты тексеріп, қайта көріңіз.';
    }
  }

  async load(month: string): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    this.rows.set([]);
    try {
      const { data, error } = await supabase.rpc('monthly_debt_report', { requested_month: `${month}-01` });
      if (request !== this.request) return;
      if (error) throw error;
      this.rows.set((data ?? []).map((row: MonthlyDebt) => ({
        distributor_id: Number(row.distributor_id), opening_debt: Number(row.opening_debt),
        paid: Number(row.paid), debt: Number(row.debt), credit_limit: Number(row.credit_limit),
      })));
    } catch {
      if (request === this.request) this.error.set('Айлық есеп жүктелмеді. Базада айлық есептің SQL жаңартуы орындалғанын тексеріп, қайта көріңіз.');
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}
