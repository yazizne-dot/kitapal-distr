import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'kzt', standalone: true })
export class KztPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || isNaN(value)) return '';
    const rounded = Math.round(value);
    const sign = rounded < 0 ? '-' : '';
    const digits = Math.abs(rounded).toString();
    const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return sign + grouped;
  }
}
