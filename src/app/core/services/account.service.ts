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

  // All operations go through the admin-users Edge Function (service_role lives server-side).
  async load(): Promise<void> {
    const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'list' } });
    if (!error && data?.users) this.accounts.set(data.users as AccountRow[]);
  }

  async create(login: string, name: string, role: Role, distributorId: number | null, password: string): Promise<string | null> {
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'create', login, name, role, distributor_id: distributorId, password },
    });
    if (error) return 'Пайдаланушыны құру қатесі (логин бос емес пе?)';
    await this.load();
    return null;
  }

  async update(id: string, name: string, role: Role, distributorId: number | null, password: string): Promise<string | null> {
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'update', id, name, role, distributor_id: distributorId, password: password || undefined },
    });
    if (error) return 'Жаңарту қатесі';
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
