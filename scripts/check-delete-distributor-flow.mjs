import { readFileSync } from 'node:fs';

const files = {
  service: readFileSync(new URL('../src/app/core/services/distributor.service.ts', import.meta.url), 'utf8'),
  component: readFileSync(new URL('../src/app/app.component.ts', import.meta.url), 'utf8'),
  template: readFileSync(new URL('../src/app/app.component.html', import.meta.url), 'utf8'),
  styles: readFileSync(new URL('../src/app/app.component.css', import.meta.url), 'utf8'),
};

const checks = [
  ['service delete method', files.service, 'async deleteIfEmpty(id: number): Promise<string | null>'],
  ['service checks orders', files.service, "this.hasRelatedRows('orders', id)"],
  ['service checks payments', files.service, "this.hasRelatedRows('payments', id)"],
  ['service checks messages', files.service, "this.hasRelatedRows('messages', id)"],
  ['service checks profiles', files.service, "this.hasRelatedRows('profiles', id)"],
  ['service blocks related records', files.service, 'Связанные записи бар, удалить нельзя'],
  ['service maps delete relation error', files.service, 'isRelationError(error.message)'],
  ['service deletes distributor only', files.service, ".from('distributors').delete().eq('id', id)"],
  ['component delete saving signal', files.component, 'distributorDeleting = signal(false)'],
  ['component delete error signal', files.component, "distributorDeleteError = signal('')"],
  ['component delete error id signal', files.component, 'distributorDeleteErrorId = signal<number | null>(null)'],
  ['component delete method', files.component, 'async deleteDistributor(distId: number, event?: Event): Promise<void>'],
  ['component stops card click', files.component, 'event?.stopPropagation();'],
  ['component admin guard', files.component, "if (this.role() !== 'admin' || this.distributorDeleting()) return;"],
  ['component confirm prompt', files.component, 'confirm(`Удалить дистрибьютора'],
  ['component calls service', files.component, 'this.distributorService.deleteIfEmpty(distId)'],
  ['component closes detail after delete', files.component, 'this.distributorDetailId.set(null);'],
  ['template delete button', files.template, '(click)="deleteDistributor(selectedDetailDistributor()!.id)"'],
  ['template list delete button', files.template, '(click)="deleteDistributor(item.id, $event)"'],
  ['template list delete label', files.template, 'Дистрибьюторды жою'],
  ['template card error is local', files.template, 'distributorDeleteErrorId() === item.id'],
  ['template delete button admin only', files.template, '*ngIf="role() === \'admin\'"'],
  ['template delete error message', files.template, 'distributorDeleteError()'],
  ['template disables delete button', files.template, '[disabled]="distributorDeleting()"'],
  ['styles danger button', files.styles, '.btn-danger-inline'],
  ['styles delete error', files.styles, '.dist-delete-error'],
];

const forbidden = [
  ['service does not delete orders', files.service, ".from('orders').delete()"],
  ['service does not delete payments', files.service, ".from('payments').delete()"],
  ['service does not delete messages', files.service, ".from('messages').delete()"],
  ['service does not delete targets', files.service, ".from('targets').delete()"],
  ['service target does not block delete', files.service, "this.hasRelatedRows('targets', id)"],
];

const missing = checks.filter(([, content, marker]) => !content.includes(marker));
const presentForbidden = forbidden.filter(([, content, marker]) => content.includes(marker));

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error('Delete distributor flow markers failed:');
  for (const [label, , marker] of missing) {
    console.error(`- missing ${label}: ${marker}`);
  }
  for (const [label, , marker] of presentForbidden) {
    console.error(`- forbidden ${label}: ${marker}`);
  }
  process.exit(1);
}

console.log(`Delete distributor flow markers present (${checks.length}/${checks.length})`);
