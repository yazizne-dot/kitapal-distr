import type {AnalyticsReport} from './analytics-data';
import {statusNames} from './analytics-data';
type Cell=string|number|null;
export function reportSections(r:AnalyticsReport):{name:string;rows:Cell[][]}[]{
  return [
    {name:'Қорытынды',rows:[['Көрсеткіш','Мән'],['Бастап',r.filter.from],['Дейін',r.filter.to],['Дистрибьютор',r.filter.distributorId?(r.distributors[0]?.company??'Дерек жоқ'):'Барлығы'],['Тапсырыс статусы',statusNames[r.filter.status]??r.filter.status],['Тапсырыс сомасы, ₸',r.amount],['Төленгені, ₸',r.paid],['Тапсырыстар',r.orders],['Кітап саны',r.qty],['Есеп ережесі','Черновик, жойылған тапсырыс және бастапқы сальдо есептелмейді.'],['Баға','Тапсырыста сақталған жеңілдіктен кейінгі баға.'],['Төлемдер','Кезеңдегі барлық төлем; тапсырыс статусы сүзгісіне тәуелсіз. Баспаға бөлінбейді.'],['Уақыт белдеуі','Asia/Almaty'],['Жиілік','Орташа аралық = (соңғы − бірінші тапсырыс уақыты) / (тапсырыс саны − 1).'],['Баспа атауы','Өнімнің қазіргі баспа атауы қолданылады.']]},
    {name:'Дистрибьюторлар',rows:[['Дистрибьютор','Қала','Тапсырыс саны','Дана','Сома, ₸','Төлем, ₸','Орташа тапсырыс, ₸','Орташа аралық, күн','Бірінші тапсырыс','Соңғы тапсырыс'],...r.distributors.map(d=>[d.company,d.city,d.orders,d.qty,d.amount,d.paid,d.averageOrder,d.averageDays,d.firstDate,d.lastDate])]},
    {name:'Баспалар',rows:[['Баспа','Дана','Тапсырыс саны','Сома, ₸','Орташа аралық, күн','Соңғы тапсырыс'],...r.publishers.map(p=>[p.publisher,p.qty,p.orders,p.amount,p.averageDays,p.lastDate])]},
    {name:'Айлар',rows:[['Ай','Тапсырыс саны','Тапсырыс сомасы, ₸','Төлем, ₸'],...r.months.map(m=>[m.month,m.orders,m.amount,m.paid])]},
    {name:'Кітаптар',rows:[['Күні','Тапсырыс','Статус','Дистрибьютор','Қала','Кітап','Штрихкод','Баспа','Дана','Баға, ₸','Сома, ₸'],...r.lines.map(l=>[l.date,l.code,statusNames[l.status]??l.status,l.company,l.city,l.book,l.barcode,l.publisher,l.qty,l.price,l.amount])]},
    {name:'Төлемдер',rows:[['Күні','Дистрибьютор','Сома, ₸','Ескертпе'],...r.payments.map(p=>[p.paid_at,p.company,p.amount,p.note])]}
  ];
}
export async function createExcel(r:AnalyticsReport){
  const X=await import('xlsx');
  const book=X.utils.book_new();
  for(const section of reportSections(r)){
    const sheet=X.utils.aoa_to_sheet(section.rows);
    sheet['!cols']=section.rows[0].map((_,col)=>({wch:Math.min(55,Math.max(16,...section.rows.slice(0,100).map(row=>String(row[col]??'').length+2)))}));
    if(sheet['!ref'])sheet['!autofilter']={ref:sheet['!ref']};
    X.utils.book_append_sheet(book,sheet,section.name);
  }
  return book;
}
export async function createPdf(r:AnalyticsReport,fontData:string){
  const {jsPDF}=await import('jspdf');
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
  doc.addFileToVFS('NotoSans.ttf',fontData);doc.addFont('NotoSans.ttf','NotoSans','normal');doc.setFont('NotoSans');
  let y=18;
  const line=(text:string,size=9,color='#301d2a')=>{
    doc.setFontSize(size);doc.setTextColor(color);
    const parts=doc.splitTextToSize(text,180) as string[];
    const height=parts.length*(size*.45+1);
    if(y+height>277 && height<255){doc.addPage();y=18;}
    for(const part of parts){
      if(y>277){doc.addPage();y=18;doc.setFont('NotoSans');doc.setFontSize(size);}
      doc.text(part,15,y);y+=size*.45+1;
    }
  };
  const section=(name:string)=>{if(y>255){doc.addPage();y=18;}y+=6;line(name,14,'#b52278');y+=2;};
  line('Kitapal — Аналитика',18,'#b52278');
  line(`${r.filter.from} — ${r.filter.to} · Алматы уақыты`,10);
  for(const row of reportSections(r)[0].rows.slice(3))line(`${row[0]}: ${row[1]}`);
  section('Ай бойынша тапсырыс пен төлем');
  const maximum=Math.max(1,...r.months.flatMap(m=>[m.amount,m.paid]));
  for(const m of r.months){
    if(y>247){doc.addPage();y=18;}
    line(`${m.month} · ${m.orders} тапсырыс`);
    doc.setFillColor('#b52278');doc.rect(15,y,180*m.amount/maximum,3,'F');y+=7;line(`Тапсырыс: ${m.amount.toLocaleString('ru-RU')} ₸`);
    doc.setFillColor('#178654');doc.rect(15,y,180*m.paid/maximum,3,'F');y+=7;line(`Төлем: ${m.paid.toLocaleString('ru-RU')} ₸`);y+=3;
  }
  section('Баспалар бойынша сома');
  const maxPublisher=Math.max(1,...r.publishers.map(p=>p.amount));
  for(const p of r.publishers){
    line(`${p.publisher} · ${p.amount.toLocaleString('ru-RU')} ₸ · ${p.qty} дана`);
    if(y>273){doc.addPage();y=18;}
    doc.setFillColor('#b52278');doc.rect(15,y,180*p.amount/maxPublisher,3,'F');y+=8;
  }
  for(const s of reportSections(r).slice(1)){
    section(s.name);
    if(s.rows.length===1)line('Дерек жоқ');
    for(const row of s.rows.slice(1)){
      const text=row.map((value,i)=>`${s.rows[0][i]}: ${value==null||value===''?'—':value}`).join(' · ');
      line(text);y+=3;
    }
  }
  const pages=doc.getNumberOfPages();
  for(let page=1;page<=pages;page++){doc.setPage(page);doc.setFontSize(8);doc.setTextColor('#756672');doc.text(`${page} / ${pages}`,195,290,{align:'right'});}
  return doc;
}
export async function exportAnalytics(r:AnalyticsReport,format:'xlsx'|'pdf'):Promise<void>{
  const name=`Kitapal-analytics-${r.filter.from}-${r.filter.to}`;
  if(format==='xlsx'){
    const X=await import('xlsx');X.writeFile(await createExcel(r),`${name}.xlsx`);return;
  }
  const response=await fetch('assets/fonts/NotoSans-Regular.ttf');
  if(!response.ok)throw Error('Font unavailable');
  const bytes=new Uint8Array(await response.arrayBuffer());
  let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
  (await createPdf(r,btoa(binary))).save(`${name}.pdf`);
}
