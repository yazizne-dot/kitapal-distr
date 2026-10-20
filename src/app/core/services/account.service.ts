import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Role } from '../models/role';

export interface AccountRow {
  id: string;
  login: string;
  full_name: string;
  role: Role;
  distributor_id: number | null;
}

@Injectable({ providedIn: 'root' })
export class AccountService {
  readonly accounts = signal<AccountRow[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal('');

  // All operations go through the admin-users Edge Function (service_role lives server-side).
  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.loadError.set('');
    try {
      let result = await supabase.functions.invoke('admin-users', { body: { action: 'list' } });
      if (result.error?.context?.status === 401) {
        const refreshed = await supabase.auth.refreshSession();
        if (!refreshed.error) result = await supabase.functions.invoke('admin-users', { body: { action: 'list' } });
      }
      if (result.error || result.data?.error || !Array.isArray(result.data?.users)) {
        const status = result.error?.context?.status;
        this.loadError.set(status === 401
          ? 'Сессияның мерзімі аяқталды. Аккаунтқа қайта кіріңіз.'
          : status === 403
            ? 'Пайдаланушылар тізімін көруге әкімші рұқсаты қажет.'
            : 'Пайдаланушылар жүктелмеді. Сервермен байланысты тексеріп, қайта көріңіз.');
        return;
      }
      this.accounts.set(result.data.users as AccountRow[]);
    } catch {
      this.loadError.set('Пайдаланушылар жүктелмеді. Байланысты тексеріп, қайта көріңіз.');
    } finally {
      this.loading.set(false);
    }
  }

  async create(login: string, name: string, role: Role, distributorId: number | null, password: string): Promise<string | null> {
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'create', login, name, role, distributor_id: distributorId, password },
    });
    if (error) return 'Пайдаланушыны құру қатесі (логин бос емес пе?)';
    await this.load();
    return null;
  }

  async update(id: string, login: string, name: string, role: Role, distributorId: number | null, password: string): Promise<string | null> {
    const normalizedLogin = login.trim().toLowerCase();
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'update', id, login: normalizedLogin, name, role, distributor_id: distributorId, password: password || undefined },
    });
    if (error) {
      const context = (error as { context?: Response }).context;
      const details = await context?.json().catch(() => null);
      return details?.error ?? 'Жаңарту қатесі';
    }
    if (data?.error) return data.error;
    if (data?.login !== normalizedLogin) {
      return 'Логин сақталмады. Сервердегі admin-users функциясын жаңарту қажет.';
    }
    await this.load();
    return null;
  }

  async remove(id: string): Promise<string | null> {
    const { error } = await supabase.functions.invoke('admin-users', { body: { action: 'delete', id } });
    if (error) return 'Жою қатесі';
    await this.load();
    return null;
  }
}
