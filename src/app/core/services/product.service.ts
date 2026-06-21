import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Product } from '../models/product';

@Injectable({ providedIn: 'root' })
export class ProductService {
  readonly products = signal<Product[]>([]);

  async load(): Promise<void> {
    const { data, error } = await supabase
      .from('products').select('*').order('name');
    if (!error && data) this.products.set(data as Product[]);
  }

  async update(id: number, patch: Partial<Product>): Promise<string | null> {
    const { error } = await supabase.from('products').update(patch).eq('id', id);
    if (error) return error.message;
    await this.load();
    return null;
  }
}
