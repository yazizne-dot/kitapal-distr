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

  async remove(id: number): Promise<string | null> {
    // The foreign key from order_items prevents deleting books used in orders.
    const { data, error } = await supabase.from('products').delete()
      .eq('id', id).neq('barcode', 'OPENING-BALANCE').select('id');
    if (error) return error.code === '23503'
      ? 'Бұл кітап тапсырыстарда қолданылған, сондықтан жоюға болмайды.'
      : error.message;
    if (!data?.length) return 'Кітап жойылмады: жоюға рұқсат жоқ немесе кітап табылмады.';
    this.products.update(products => products.filter(product => product.id !== id));
    return null;
  }

  async update(id: number, patch: Partial<Product>): Promise<string | null> {
    const { error } = await supabase.from('products').update(patch).eq('id', id);
    if (error) return error.message;
    await this.load();
    return null;
  }
}
