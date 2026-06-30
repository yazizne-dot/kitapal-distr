import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Profile } from '../models/profile';
import { Role } from '../models/role';

export function loginToEmail(login: string): string {
  const v = login.trim().toLowerCase();
  return v.includes('@') ? v : `${v}@kitapal.kz`;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly profile = signal<Profile | null>(null);
  readonly role = signal<Role>('distributor');
  readonly signedIn = signal(false);

  async login(login: string, password: string): Promise<string | null> {
    const email = loginToEmail(login);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return 'Логин немесе пароль қате';
    await this.loadProfile();
    return null;
  }

  async loadProfile(): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { this.signedIn.set(false); return; }
    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', auth.user.id).single();
    if (profile) {
      this.profile.set(profile as Profile);
      this.role.set((profile as Profile).role);
      this.signedIn.set(true);
    }
  }

  async logout(): Promise<void> {
    await supabase.auth.signOut();
    this.profile.set(null);
    this.signedIn.set(false);
  }

  async changePassword(newPassword: string): Promise<string | null> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return error ? error.message : null;
  }
}
