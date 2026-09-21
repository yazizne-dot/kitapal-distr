import { readFileSync } from 'node:fs';

const files = {
  component: readFileSync(new URL('../src/app/app.component.ts', import.meta.url), 'utf8'),
  template: readFileSync(new URL('../src/app/app.component.html', import.meta.url), 'utf8'),
};

const checks = [
  ['selected order does not auto fallback', files.component, "this.visibleOrders().find((order) => order.id === this.selectedOrderId()) ?? null"],
  ['selected order type allows null', files.component, 'selectedOrder = computed<Order | null>(() =>'],
  ['delete reloads before clearing selection', files.component, 'await this.reloadAll();\n    if (this.selectedOrderId() === orderId) {\n      this.selectedOrderId.set(\'\');'],
  ['delete closes add item modal', files.component, 'this.addItemModal.set(false);'],
  ['delete closes ship modal', files.component, 'this.shipModal.set(false);'],
  ['detail panel stays guarded', files.template, '<div class="order-detail-panel" *ngIf="selectedOrder()">'],
];

const forbidden = [
  ['old selected order fallback', files.component, '?? this.sortedVisibleOrders()[0]'],
  ['old pre-delete selection clear', files.component, "if (this.selectedOrderId() === orderId) {\n      this.selectedOrderId.set('');\n    }\n    const err = await this.orderService.hardDelete"],
];

const missing = checks.filter(([, content, marker]) => !content.includes(marker));
const presentForbidden = forbidden.filter(([, content, marker]) => content.includes(marker));

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error('Order delete selection markers failed:');
  for (const [label, , marker] of missing) {
    console.error(`- missing ${label}: ${marker}`);
  }
  for (const [label, , marker] of presentForbidden) {
    console.error(`- forbidden ${label}: ${marker}`);
  }
  process.exit(1);
}

console.log(`Order delete selection markers present (${checks.length}/${checks.length})`);
