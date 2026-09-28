export interface AnalyticsDistributor { id: number; company: string; city: string; }
export interface AnalyticsOrder { id: string; order_code: string | null; distributor_id: number; status: string; created_at: string; }
export interface AnalyticsItem { id: number; order_id: string; product_id: number; qty: number; unit_price: number; products: { name: string; barcode: string; publisher: string } | null; }
export interface AnalyticsPayment { id: number; distributor_id: number; amount: number; paid_at: string; note: string; }
export interface AnalyticsData { distributors: AnalyticsDistributor[]; orders: AnalyticsOrder[]; items: AnalyticsItem[]; payments: AnalyticsPayment[]; }
export interface AnalyticsFilter { from: string; to: string; distributorId: number; status: string; }
export interface BookLine { orderId: string; code: string; date: string; status: string; distributorId: number; company: string; city: string; productId: number; book: string; barcode: string; publisher: string; qty: number; price: number; amount: number; }
export interface DistributorAnalysis { id: number; company: string; city: string; amount: number; qty: number; paid: number; orders: number; averageOrder: number; averageDays: number | null; firstDate: string; lastDate: string; }
export interface PublisherAnalysis { publisher: string; qty: number; amount: number; orders: number; averageDays: number | null; lastDate: string; }
export interface MonthAnalysis { month: string; amount: number; paid: number; orders: number; }
export interface AnalyticsReport { filter: AnalyticsFilter; lines: BookLine[]; payments: (AnalyticsPayment & {company: string})[]; distributors: DistributorAnalysis[]; publishers: PublisherAnalysis[]; months: MonthAnalysis[]; amount: number; paid: number; qty: number; orders: number; }
export const activeStatuses = ['pending', 'confirmed', 'shipped', 'delivered'];
export async function readAllPages<T>(fetchPage:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>):Promise<T[]>{
  const rows:T[]=[];
  for(let from=0;;from+=500){
    const page=await fetchPage(from,from+499);
    if(page.error)throw page.error;
    if(!page.data)throw Error('Incomplete analytics response');
    rows.push(...page.data);
    if(page.data.length<500)return rows;
  }
}
export const statusNames: Record<string,string> = { active:'Барлық белсенді',pending:'Күтуде',confirmed:'Расталды',shipped:'Жөнелтілді',delivered:'Жеткізілді' };
export function almatyDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const get=(name:string)=>parts.find(p=>p.type===name)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
const round=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
export function buildAnalytics(data: AnalyticsData, filter: AnalyticsFilter): AnalyticsReport {
  const distributors=data.distributors.filter(d=>!filter.distributorId||d.id===filter.distributorId);
  const byDist=new Map(distributors.map(d=>[d.id,d]));
  const inRange=(date:string)=>date>=filter.from&&date<=filter.to;
  const orders=new Map(data.orders.filter(o=>byDist.has(o.distributor_id)&&activeStatuses.includes(o.status)&&(filter.status==='active'||o.status===filter.status)&&inRange(almatyDate(o.created_at))).map(o=>[o.id,o]));
  const lines:BookLine[]=[];
  for(const item of data.items){
    const order=orders.get(item.order_id);
    if(!order||item.products?.barcode==='OPENING-BALANCE')continue;
    const d=byDist.get(order.distributor_id)!;
    const qty=Number(item.qty),price=Number(item.unit_price);
    lines.push({orderId:order.id,code:order.order_code??order.id,date:almatyDate(order.created_at),status:order.status,distributorId:d.id,company:d.company,city:d.city,productId:item.product_id,book:item.products?.name??'Атауы жоқ',barcode:item.products?.barcode??'',publisher:item.products?.publisher?.trim()||'Баспа көрсетілмеген',qty,price,amount:round(qty*price)});
  }
  lines.sort((a,b)=>a.date.localeCompare(b.date)||a.code.localeCompare(b.code)||a.book.localeCompare(b.book));
  const usedOrders=new Set(lines.map(l=>l.orderId));
  const payments=data.payments.filter(p=>byDist.has(p.distributor_id)&&inRange(p.paid_at)).map(p=>({...p,amount:Number(p.amount),company:byDist.get(p.distributor_id)!.company})).sort((a,b)=>a.paid_at.localeCompare(b.paid_at)||a.id-b.id);
  const distRows=distributors.map(d=>{
    const own=lines.filter(l=>l.distributorId===d.id);
    const ownOrders=[...orders.values()].filter(o=>o.distributor_id===d.id&&usedOrders.has(o.id)).sort((a,b)=>a.created_at.localeCompare(b.created_at));
    const amount=round(own.reduce((s,l)=>s+l.amount,0));
    return {id:d.id,company:d.company,city:d.city,amount,qty:own.reduce((s,l)=>s+l.qty,0),paid:round(payments.filter(p=>p.distributor_id===d.id).reduce((s,p)=>s+p.amount,0)),orders:ownOrders.length,averageOrder:ownOrders.length?round(amount/ownOrders.length):0,averageDays:ownOrders.length>1?round((Date.parse(ownOrders.at(-1)!.created_at)-Date.parse(ownOrders[0].created_at))/86400000/(ownOrders.length-1)):null,firstDate:ownOrders.length?almatyDate(ownOrders[0].created_at):'',lastDate:ownOrders.length?almatyDate(ownOrders.at(-1)!.created_at):''};
  }).sort((a,b)=>b.amount-a.amount||a.company.localeCompare(b.company));
  const publishers=[...new Set(lines.map(l=>l.publisher))].map(publisher=>{
    const own=lines.filter(l=>l.publisher===publisher);
    const dates=[...new Set(own.map(l=>l.orderId))].map(id=>orders.get(id)!.created_at).sort();
    return {publisher,amount:round(own.reduce((s,l)=>s+l.amount,0)),qty:own.reduce((s,l)=>s+l.qty,0),orders:dates.length,averageDays:dates.length>1?round((Date.parse(dates.at(-1)!)-Date.parse(dates[0]))/86400000/(dates.length-1)):null,lastDate:dates.length?almatyDate(dates.at(-1)!):''};
  }).sort((a,b)=>b.amount-a.amount);
  const months:MonthAnalysis[]=[];
  for(let cursor=filter.from.slice(0,7);cursor<=filter.to.slice(0,7);){
    const own=lines.filter(l=>l.date.startsWith(cursor));
    months.push({month:cursor,amount:round(own.reduce((s,l)=>s+l.amount,0)),paid:round(payments.filter(p=>p.paid_at.startsWith(cursor)).reduce((s,p)=>s+p.amount,0)),orders:new Set(own.map(l=>l.orderId)).size});
    const [year,month]=cursor.split('-').map(Number);cursor=month===12?`${year+1}-01`:`${year}-${String(month+1).padStart(2,'0')}`;
  }
  return {filter:{...filter},lines,payments,distributors:distRows,publishers,months,amount:round(lines.reduce((s,l)=>s+l.amount,0)),paid:round(payments.reduce((s,p)=>s+p.amount,0)),qty:lines.reduce((s,l)=>s+l.qty,0),orders:usedOrders.size};
}
