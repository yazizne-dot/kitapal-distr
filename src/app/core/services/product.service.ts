import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Product } from '../models/product';

@Injectable({ providedIn: 'root' })
export class ProductService {
  readonly products = signal<Product[]>([]);

  async load(): Promise<void> {
    const pageSize = 1000;
    const all: Product[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('products').select('*').order('name').order('id').range(from, from + pageSize - 1);
      if (error) return;
      all.push(...((data ?? []) as Product[]));
      if (!data || data.length < pageSize) break;
    }
    this.products.set(all);
  }

  async create(input: Pick<Product, 'name' | 'barcode' | 'publisher' | 'category' | 'base_price'>): Promise<string | null> {
    const { error } = await supabase.from('products').insert({ ...input, discount_override: null });
    if (error) return error.code === '23505' ? 'Бұл штрихкодпен кітап бұрыннан бар.' : error.message;
    await this.load();
    return null;
  }

  async update(id: number, patch: Partial<Product>): Promise<string | null> {
    const { error } = await supabase.from('products').update(patch).eq('id', id);
    if (error) return error.message;
    await this.load();
    return null;
  }
}
