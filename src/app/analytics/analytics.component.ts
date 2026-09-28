import {Component,OnInit,signal,computed} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {supabase} from '../core/supabase.client';
import {KztPipe} from '../kzt.pipe';
import {AnalyticsData,AnalyticsOrder,AnalyticsItem,AnalyticsPayment,AnalyticsDistributor,almatyDate,buildAnalytics,statusNames,readAllPages} from './analytics-data';

@Component({selector:'app-analytics',standalone:true,imports:[CommonModule,FormsModule,KztPipe],templateUrl:'./analytics.component.html',styleUrl:'./analytics.component.css'})
export class AnalyticsComponent implements OnInit {
  readonly today=almatyDate(new Date().toISOString());
  from=signal(this.today.slice(0,7)+'-01');to=signal(this.today);
  distributorId=signal(0);status=signal('active');loading=signal(false);error=signal('');exporting=signal(false);
  data=signal<AnalyticsData>({distributors:[],orders:[],items:[],payments:[]});
  readonly statusNames=statusNames;
  statusOptions=Object.entries(statusNames);
  valid=computed(()=>/^\d{4}-\d{2}-\d{2}$/.test(this.from())&&/^\d{4}-\d{2}-\d{2}$/.test(this.to())&&this.from()<=this.to()&&this.from()>='2000-01-01'&&this.to()<='2100-12-31');
  report=computed(()=>buildAnalytics(this.data(),{from:this.valid()?this.from():this.today,to:this.valid()?this.to():this.today,distributorId:Number(this.distributorId()),status:this.status()}));
  maxMonthly=computed(()=>Math.max(1,...this.report().months.flatMap(m=>[m.amount,m.paid])));
  maxPublisher=computed(()=>Math.max(1,...this.report().publishers.map(p=>p.amount)));
  maxFrequency=computed(()=>Math.max(1,...this.report().distributors.map(d=>d.orders)));
  async ngOnInit():Promise<void>{await this.reload();}
  async reload():Promise<void>{
    this.loading.set(true);this.error.set('');
    try{
      const page=async<T>(table:string,select:string):Promise<T[]>=>{
        return readAllPages<T>(async(from,to)=>{
          const {data,error}=await supabase.from(table).select(select).order('id').range(from,to);
          return {data:data as unknown as T[]|null,error};
        });
      };
      const [distributors,orders,items,payments]=await Promise.all([
        page<AnalyticsDistributor>('distributors','id,company,city'),
        page<AnalyticsOrder>('orders','id,order_code,distributor_id,status,created_at'),
        page<AnalyticsItem>('order_items','id,order_id,product_id,qty,unit_price,products(name,barcode,publisher)'),
        page<AnalyticsPayment>('payments','id,distributor_id,amount,paid_at,note')
      ]);
      this.data.set({distributors,orders,items,payments});
    }catch{this.error.set('Деректер толық жүктелмеді. «Жаңарту» басып, қайта көріңіз.');}
    finally{this.loading.set(false);}
  }
  async export(format:'xlsx'|'pdf'):Promise<void>{
    if(this.loading()||this.error()||!this.valid()||this.exporting())return;
    this.exporting.set(true);
    try{
      const {exportAnalytics}=await import('./analytics-export');
      await exportAnalytics(this.report(),format);
    }catch{this.error.set('Экспорт жасалмады. Деректерді жаңартып, қайта көріңіз.');}
    finally{this.exporting.set(false);}
  }
}
