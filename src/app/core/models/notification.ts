export interface AppNotif {
  type: 'danger' | 'warning' | 'success' | 'info';
  distributor_id: number;
  title: string;
  body: string;
  date: string;
}
