import { readFileSync } from 'node:fs';

const files = {
  component: readFileSync(new URL('../src/app/app.component.ts', import.meta.url), 'utf8'),
  template: readFileSync(new URL('../src/app/app.component.html', import.meta.url), 'utf8'),
  migration: readFileSync(new URL('../supabase/migrations/20260703000100_allow_shared_order_delete.sql', import.meta.url), 'utf8'),
};

const checks = [
  ['shared delete capability exists', files.component, 'canHardDeleteOrder(order: Order): boolean'],
  ['admin manager can hard delete', files.component, "if (this.role() === 'admin' || this.role() === 'manager') return true;"],
  ['distributor can hard delete own open orders', files.component, "order.distributorId === this.selectedDistributorId() && ['pending', 'draft', 'cancelled'].includes(order.status)"],
  ['distributor cancel delegates to hard delete', files.component, 'await this.permanentlyDeleteOrder(orderId);'],
  ['detail delete button uses hard delete', files.template, '(click)="permanentlyDeleteOrder(selectedOrder()!.id)"'],
  ['detail delete button gated', files.template, '*ngIf="canHardDeleteOrder(selectedOrder()!)"'],
  ['migration drops old order delete policy', files.migration, 'drop policy if exists orders_shared_delete on public.orders;'],
  ['migration creates delete policy', files.migration, 'create policy orders_shared_delete on public.orders for delete'],
  ['migration manager delete', files.migration, "private.my_role() = 'manager' and private.can_access_distributor(distributor_id)"],
  ['migration distributor delete own open orders', files.migration, "private.my_role() = 'distributor' and distributor_id = private.my_distributor_id()"],
];

const forbidden = [
  ['distributor delete must not cancel status', files.component, "async distributorCancelOrder(orderId: string): Promise<void> {\n    await this.updateOrderStatus(orderId, 'cancelled'"],
];

const missing = checks.filter(([, content, marker]) => !content.includes(marker));
const presentForbidden = forbidden.filter(([, content, marker]) => content.includes(marker));

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error('Shared order delete flow markers failed:');
  for (const [label, , marker] of missing) {
    console.error(`- missing ${label}: ${marker}`);
  }
  for (const [label, , marker] of presentForbidden) {
    console.error(`- forbidden ${label}: ${marker}`);
  }
  process.exit(1);
}

console.log(`Shared order delete flow markers present (${checks.length}/${checks.length})`);
