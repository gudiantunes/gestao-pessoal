(function(){
"use strict";

/* ---------- utilidades ---------- */
const $=s=>document.querySelector(s);
const main=$("#main"), nav=$("#nav"), layer=$("#layer"), toastEl=$("#toast"), syncEl=$("#sync");
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>"x"+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3);
const clone=o=>JSON.parse(JSON.stringify(o));
const LS={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const todayISO=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};

const HUES=[18,45,95,160,200,240,285,330];
const ICONS=["📋","🚕","🔧","🛒","💰","🚲","🏠","⛽","✅","📅","📒","🛠️","📦","🎯","📈","🍽️"];
const TYPES={text:"Texto",number:"Número",money:"Dinheiro (R$)",date:"Data",time:"Hora",check:"Marcar (✓)",select:"Lista de opções",formula:"Fórmula"};
const LBL={sum:"Soma",avg:"Média",min:"Mín",max:"Máx",count:"Contagem"};
const IC_HOME='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>';
const IC_DOTS='<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';

const NF=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:2});
const NF0=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:0});
const MF=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const PF=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1});

/* ---------- números e fórmulas ---------- */
function evalExpr(src,getRef){
  const toks=(String(src).match(/\{[^}]*\}|\d+(?:[.,]\d+)?|[()+\-*\/×÷]|\s+|./g)||[]);
  const t=toks.filter(x=>!/^\s+$/.test(x)).map(x=>x==="×"?"*":x==="÷"?"/":x);
  let i=0;
  const peek=()=>t[i];
  function expr(){let v=term();while(peek()==="+"||peek()==="-"){const o=t[i++];const r=term();v=o==="+"?v+r:v-r}return v}
  function term(){let v=unary();while(peek()==="*"||peek()==="/"){const o=t[i++];const r=unary();if(o==="*")v*=r;else{if(r===0)throw new Error("div0");v/=r}}return v}
  function unary(){if(peek()==="-"){i++;return -unary()}if(peek()==="+"){i++;return unary()}return atom()}
  function atom(){
    const x=t[i++];
    if(x===undefined)throw new Error("fim");
    if(x==="("){const v=expr();if(t[i++]!==")")throw new Error("parenteses");return v}
    if(x[0]==="{")return getRef(x.slice(1,-1));
    if(/^\d/.test(x))return parseFloat(x.replace(",","."));
    throw new Error("símbolo");
  }
  const v=expr();
  if(i!==t.length)throw new Error("sobra");
  return v;
}
function parseNum(s){
  if(typeof s==="number")return isFinite(s)?s:null;
  if(s==null)return null;
  s=String(s).trim();
  if(!s)return null;
  try{
    if(s[0]==="="){const v=evalExpr(s.slice(1),()=>{throw new Error("ref")});return isFinite(v)?Math.round(v*1e6)/1e6:null}
    s=s.replace(/R\$|\s/g,"");
    if(s.indexOf(",")>-1)s=s.replace(/\./g,"").replace(",",".");
    const v=parseFloat(s);
    return isFinite(v)?v:null;
  }catch(e){return null}
}
const kindOf=c=>c.type==="formula"?(c.fmt||"number"):c.type;
function fmtNum(kind,v){
  if(v==null||v===""||typeof v!=="number"||!isFinite(v))return "";
  return kind==="money"?MF.format(v):kind==="percent"?PF.format(v)+"%":NF.format(v);
}
const fmtRaw=v=>v==null||v===""?"":String(v).replace(".",",");
function fmtDate(s){const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(s||"");return m?m[3]+"/"+m[2]+"/"+m[1]:(s||"")}

function cellVal(c,r,tab,d){
  d=d||0;
  if(c.type==="formula"){
    if(!c.formula||d>4)return null;
    try{
      const v=evalExpr(c.formula,name=>{
        const k=tab.cols.find(x=>x.name.trim().toLowerCase()===name.trim().toLowerCase());
        if(!k)throw new Error("ref");
        const x=cellVal(k,r,tab,d+1);
        return typeof x==="number"?x:(x===true?1:(parseNum(x)||0));
      });
      return isFinite(v)?v:null;
    }catch(e){return null}
  }
  const v=r.cells?r.cells[c.id]:undefined;
  return v===undefined?null:v;
}
function dispText(c,r,tab){
  const v=cellVal(c,r,tab);
  if(v==null||v==="")return "";
  switch(c.type){
    case "number":case "money":case "formula":return fmtNum(kindOf(c),v);
    case "date":return fmtDate(v);
    case "check":return v?"✓":"";
    default:return String(v);
  }
}
function totalOf(c,rows,tab){
  const vs=rows.map(r=>cellVal(c,r,tab)).filter(v=>v!=null&&v!==""&&v!==false);
  if(c.total==="count")return vs.length;
  const ns=vs.map(v=>v===true?1:(typeof v==="number"?v:null)).filter(v=>v!=null);
  if(!ns.length)return null;
  switch(c.total){
    case "sum":return ns.reduce((a,b)=>a+b,0);
    case "avg":return ns.reduce((a,b)=>a+b,0)/ns.length;
    case "min":return Math.min.apply(null,ns);
    case "max":return Math.max.apply(null,ns);
  }
  return null;
}
function fmtTotal(c,v){
  if(v==null)return "—";
  if(c.total==="count"||c.type==="check")return NF0.format(v);
  return fmtNum(kindOf(c),v)||"—";
}
const isNumeric=c=>c.type==="number"||c.type==="money"||c.type==="formula";
function sortRows(rs,c,dir,tab){
  const f=r=>{const v=cellVal(c,r,tab);return v==null||v===""?null:v};
  return rs.slice().sort((a,b)=>{
    const x=f(a),y=f(b);
    if(x==null&&y==null)return 0;
    if(x==null)return 1;
    if(y==null)return -1;
    const k=(typeof x==="number"&&typeof y==="number")?x-y:String(x).localeCompare(String(y),"pt-BR",{numeric:true});
    return dir*k;
  });
}

/* ---------- modelos de ferramenta ---------- */
const col=(name,type,x)=>Object.assign({id:uid(),name:name,type:type},x||{});
const TEMPLATES=[
  {key:"blank",name:"Em branco",icon:"📋",hue:0,desc:"Uma planilha simples para montar do seu jeito.",
   tabs:()=>[{id:uid(),name:"Planilha 1",cols:[col("Item","text"),col("Valor","money",{total:"sum"})]}]},
  {key:"taxi",name:"Corridas",icon:"🚕",hue:1,desc:"Data, cliente, trecho, km, valor e valor por km. Mais uma aba de gastos.",
   tabs:()=>[
    {id:uid(),name:"Corridas",cols:[col("Data","date"),col("Cliente","text"),col("Origem","text"),col("Destino","text"),col("Km","number",{total:"sum"}),col("Valor","money",{total:"sum"}),col("Passagem","money",{total:"sum"}),col("Saída","time"),col("Chegada","time"),col("Valor/km","formula",{formula:"({Valor}+{Passagem})/{Km}",fmt:"money",total:"avg"})]},
    {id:uid(),name:"Gastos",cols:[col("Data","date"),col("Tipo","select",{opts:["Gasolina","Manutenção","Passagem","Outros"]}),col("Descrição","text"),col("Valor","money",{total:"sum"})]}]},
  {key:"car",name:"Manutenção do carro",icon:"🔧",hue:4,desc:"Serviços feitos, com km e valor, e as trocas periódicas.",
   tabs:()=>[
    {id:uid(),name:"Serviços",cols:[col("Data","date"),col("Serviço","text"),col("Categoria","select",{opts:["Motor","Pneus","Suspensão","Elétrica","Documentos","Outros"]}),col("KM","number"),col("Valor","money",{total:"sum"}),col("Local","text")]},
    {id:uid(),name:"Periódicas",cols:[col("Serviço","text"),col("Último km","number"),col("A cada (km)","number"),col("Próxima troca","formula",{formula:"{Último km}+{A cada (km)}",fmt:"number"})]}]},
  {key:"list",name:"Lista de compras",icon:"🛒",hue:2,desc:"Itens, preço, prioridade, onde comprar e se já comprou.",
   tabs:()=>[{id:uid(),name:"Lista",cols:[col("Item","text"),col("Preço","money",{total:"sum"}),col("Prioridade","select",{opts:["Alta","Média","Baixa"]}),col("Local","text"),col("Comprado","check",{total:"count"})]}]},
  {key:"money",name:"Finanças",icon:"💰",hue:3,desc:"Entradas, gastos fixos e variáveis e quanto guardar.",
   tabs:()=>[{id:uid(),name:"Lançamentos",cols:[col("Data","date"),col("Descrição","text"),col("Tipo","select",{opts:["Entrada","Gasto fixo","Gasto variável","Guardar"]}),col("Valor","money",{total:"sum"})]}]}
];

/* ---------- armazenamento: nuvem (db) ou só neste aparelho ---------- */
function cloudStore(db){
  const q=new Map();
  const run=(path,fn)=>{const p=(q.get(path)||Promise.resolve()).catch(()=>{}).then(fn);q.set(path,p);return p};
  const arr=s=>s.docs.map(d=>Object.assign({id:d.id},d.data()));
  const rp=(t,r)=>"tools/"+t+"/rows/"+r;
  return {
    kind:"cloud",
    watchTools(cb){return db.collection("tools").onSnapshot(s=>cb(arr(s)),e=>toast("Falha ao carregar as ferramentas."))},
    watchRows(t,cb){return db.collection("tools/"+t+"/rows").onSnapshot(s=>cb(arr(s)),e=>toast("Falha ao carregar os registros."))},
    setTool:(id,d)=>run("tools/"+id,()=>db.doc("tools/"+id).set(d)),
    patchTool:(id,d)=>run("tools/"+id,()=>db.doc("tools/"+id).update(d)),
    async delTool(id){
      const s=await db.collection("tools/"+id+"/rows").get();
      const ids=s.docs.map(d=>d.id);
      for(let i=0;i<ids.length;i+=10){await Promise.all(ids.slice(i,i+10).map(r=>db.doc(rp(id,r)).delete()))}
      await db.doc("tools/"+id).delete();
    },
    setRow:(t,id,d)=>run(rp(t,id),()=>db.doc(rp(t,id)).set(d)),
    patchCells:(t,id,cells)=>run(rp(t,id),()=>db.doc(rp(t,id)).update({cells:cells})),
    delRow:(t,id)=>run(rp(t,id),()=>db.doc(rp(t,id)).delete())
  };
}

function localStore(){
  let data={tools:{},rows:{}};
  try{const s=LS.get("mp.db");if(s)data=JSON.parse(s)}catch(e){}
  data.tools=data.tools||{};data.rows=data.rows||{};
  const tl=new Set(),rl=new Map();
  const save=()=>LS.set("mp.db",JSON.stringify(data));
  const arrT=()=>Object.keys(data.tools).map(id=>Object.assign({id:id},clone(data.tools[id])));
  const arrR=t=>Object.keys(data.rows[t]||{}).map(id=>Object.assign({id:id},clone(data.rows[t][id])));
  const fT=()=>tl.forEach(f=>f(arrT()));
  const fR=t=>(rl.get(t)||new Set()).forEach(f=>f(arrR(t)));
  return {
    kind:"local",
    watchTools(cb){tl.add(cb);cb(arrT());return()=>tl.delete(cb)},
    watchRows(t,cb){if(!rl.has(t))rl.set(t,new Set());rl.get(t).add(cb);cb(arrR(t));return()=>rl.get(t).delete(cb)},
    async setTool(id,d){data.tools[id]=clone(d);save();fT()},
    async patchTool(id,d){data.tools[id]=Object.assign(data.tools[id]||{},clone(d));save();fT()},
    async delTool(id){delete data.tools[id];delete data.rows[id];save();fT()},
    async setRow(t,id,d){(data.rows[t]=data.rows[t]||{})[id]=clone(d);save();fR(t)},
    async patchCells(t,id,cells){const r=(data.rows[t]||{})[id];if(!r)return;r.cells=Object.assign(r.cells||{},clone(cells));save();fR(t)},
    async delRow(t,id){if(data.rows[t])delete data.rows[t][id];save();fR(t)}
  };
}

/* ---------- estado ---------- */
let store=null, unsubRows=null;
const mq=window.matchMedia("(max-width: 720px)");
const state={tools:null,rows:null,view:"home",q:"",sig:null,mobile:mq.matches,dirty:false,focusRow:null,known:new Set(),init:false,m:null};

const curTool=()=>state.tools&&state.tools.find(t=>t.id===state.view);
function curTab(t){
  const tabs=t.tabs||[];
  const id=LS.get("mp.tab."+t.id);
  return tabs.find(x=>x.id===id)||tabs[0]||{id:"none",name:"",cols:[]};
}
const getSort=id=>{try{return JSON.parse(LS.get("mp.sort."+id))}catch(e){return null}};
const setSort=(id,v)=>LS.set("mp.sort."+id,JSON.stringify(v));

let toastTimer=null;
function toast(msg,action){
  toastEl.innerHTML="<span>"+esc(msg)+"</span>"+(action?'<button type="button" id="toastbtn">'+esc(action.label)+"</button>":"");
  toastEl.classList.add("on");
  const b=$("#toastbtn");
  if(b)b.onclick=()=>{toastEl.classList.remove("on");action.fn()};
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toastEl.classList.remove("on"),action?7000:3500);
}
async function safe(fn){
  try{await fn()}catch(e){console.error(e);toast("Não foi possível salvar. Confira a conexão e tente de novo.")}
}

/* ---------- navegação ---------- */
function setView(v){
  state.view=v;state.q="";state.sig=null;state.rows=null;state.dirty=false;
  LS.set("mp.view",v);
  if(unsubRows){unsubRows();unsubRows=null}
  if(v!=="home"){
    unsubRows=store.watchRows(v,rows=>{if(state.view===v){state.rows=rows;render()}});
  }
  render();
  const on=nav.querySelector(".chip.on");
  if(on&&on.scrollIntoView)on.scrollIntoView({inline:"center",block:"nearest"});
  window.scrollTo(0,0);
}

function renderNav(){
  const tools=state.tools||[];
  nav.innerHTML='<button class="chip'+(state.view==="home"?" on":"")+'" data-act="home">'+IC_HOME+"<span>Início</span></button>"+
    tools.map(t=>'<button class="chip'+(state.view===t.id?" on":"")+'" data-act="open" data-id="'+t.id+'" style="--h:'+HUES[t.hue||0]+'"><i class="ico">'+esc(t.icon||"📋")+"</i><span>"+esc(t.name)+"</span></button>").join("")+
    '<button class="chip add" data-act="newtool" aria-label="Nova ferramenta">+</button>';
}

function renderHome(){
  state.sig=null;
  const ts=state.tools;
  if(ts==null){main.innerHTML='<p class="muted pad">Carregando…</p>';return}
  if(!ts.length){
    main.innerHTML='<section class="home"><h1 class="h">Comece pela sua primeira ferramenta</h1>'+
      '<p class="sub">Cada ferramenta é uma planilha com abas e colunas que você define. Escolha um modelo pronto ou comece em branco. Dá para mudar tudo depois.</p>'+
      '<div class="tplcards">'+TEMPLATES.map(tp=>'<button class="tplcard" data-act="tpl" data-key="'+tp.key+'" style="--h:'+HUES[tp.hue]+'"><i class="ico lg">'+tp.icon+"</i><b>"+esc(tp.name)+"</b><small>"+esc(tp.desc)+"</small></button>").join("")+"</div></section>";
    return;
  }
  main.innerHTML='<section class="home"><h1 class="h">Suas ferramentas</h1><p class="sub">Toque em uma para abrir. Para criar outra, use o botão com o sinal de mais.</p><div class="tiles">'+
    ts.map(t=>'<button class="tile" data-act="open" data-id="'+t.id+'" style="--h:'+HUES[t.hue||0]+'"><i class="ico lg">'+esc(t.icon||"📋")+"</i><b>"+esc(t.name)+"</b><small>"+(t.tabs||[]).length+((t.tabs||[]).length===1?" aba":" abas")+"</small></button>").join("")+
    '<button class="tile new" data-act="newtool"><span class="plus">+</span><b>Nova ferramenta</b></button></div></section>';
}

function shellSig(t){
  return [t.id,state.mobile,t.name,t.icon,t.hue,(t.tabs||[]).map(x=>x.id+":"+x.name).join(","),curTab(t).id].join("|");
}
function shellHTML(t){
  const tab=curTab(t);
  return '<div class="toolhead" style="--h:'+HUES[t.hue||0]+'"><i class="ico lg">'+esc(t.icon||"📋")+"</i><h1>"+esc(t.name)+'</h1><button class="ghost" data-act="toolset" aria-label="Ajustes da ferramenta">'+IC_DOTS+"</button></div>"+
    '<div class="tabs" role="tablist">'+(t.tabs||[]).map(x=>'<button class="tab'+(x.id===tab.id?" on":"")+'" role="tab" data-act="tab" data-id="'+x.id+'">'+esc(x.name)+"</button>"+(x.id===tab.id?'<button class="tabgear" data-act="tabset" aria-label="Ajustes da aba">'+IC_DOTS+"</button>":"")).join("")+'<button class="tab add" data-act="newtab">+ Aba</button></div>'+
    '<div class="bar"><label class="search"><input id="q" type="search" placeholder="Buscar nesta aba" value="'+esc(state.q)+'" autocomplete="off"></label>'+
    '<button class="btn" data-act="cols">Colunas</button><button class="btn pri desk" data-act="addrow">+ Nova linha</button></div>'+
    '<div id="sum"></div><div id="grid"></div><button class="fab" data-act="addrow" aria-label="Novo registro">+</button>';
}

function render(){
  renderNav();
  if(editingNow()){state.dirty=true;return}
  if(state.view==="home"||state.tools==null){renderHome();return}
  const t=curTool();
  if(!t){main.innerHTML='<p class="muted pad">Carregando…</p>';return}
  const sig=shellSig(t);
  if(sig!==state.sig){main.innerHTML=shellHTML(t);state.sig=sig}
  renderGrid();
}
function editingNow(){
  const a=document.activeElement;
  return !!(a&&main.contains(a)&&a.matches&&a.matches(".gridwrap input,.gridwrap select"));
}

/* ---------- grade ---------- */
function cellHTML(c,r,tab){
  const v=cellVal(c,r,tab);
  const d=' data-col="'+c.id+'" aria-label="'+esc(c.name)+'"';
  switch(c.type){
    case "number":case "money":
      return '<td class="t-'+c.type+'"><input class="num" inputmode="decimal" autocomplete="off" data-t="1"'+d+' value="'+esc(fmtNum(c.type,v))+'"></td>';
    case "date":return '<td class="t-date"><input type="date"'+d+' value="'+esc(v||"")+'"></td>';
    case "time":return '<td class="t-time"><input type="time"'+d+' value="'+esc(v||"")+'"></td>';
    case "check":return '<td class="t-check"><label class="chkcell"><input type="checkbox"'+d+(v?" checked":"")+"></label></td>";
    case "select":{
      const opts=(c.opts||[]).slice();
      if(v&&opts.indexOf(v)<0)opts.push(v);
      return '<td class="t-select"><select'+d+'><option value=""></option>'+opts.map(o=>'<option value="'+esc(o)+'"'+(o===v?" selected":"")+">"+esc(o)+"</option>").join("")+"</select></td>";
    }
    case "formula":return '<td class="t-formula"><span class="fx">'+esc(fmtNum(kindOf(c),v)||"—")+"</span></td>";
    default:return '<td class="t-text"><input type="text" autocomplete="off"'+d+' value="'+esc(v==null?"":v)+'"></td>';
  }
}
function tableHTML(tab,rows){
  const cols=tab.cols, so=getSort(tab.id);
  const th=cols.map(c=>'<th scope="col" data-act="sort" data-col="'+c.id+'"'+(isNumeric(c)?' style="text-align:right"':"")+">"+esc(c.name)+(so&&so.col===c.id?(so.dir>0?" ↑":" ↓"):"")+"</th>").join("");
  const body=rows.map((r,i)=>'<tr data-id="'+r.id+'"><td class="rn">'+(i+1)+"</td>"+cols.map(c=>cellHTML(c,r,tab)).join("")+'<td class="x"><button class="rx" data-act="delrow" data-id="'+r.id+'" aria-label="Excluir linha">×</button></td></tr>').join("");
  let foot="";
  if(cols.some(c=>c.total)){
    foot='<tfoot><tr><td class="rn"></td>'+cols.map(c=>c.total?'<td class="tot"><small>'+LBL[c.total]+"</small><b>"+fmtTotal(c,totalOf(c,rows,tab))+"</b></td>":"<td></td>").join("")+"<td></td></tr></tfoot>";
  }
  return '<div class="gridwrap"><table class="grid"><thead><tr><th class="rn"></th>'+th+'<th class="x"></th></tr></thead><tbody>'+body+"</tbody>"+foot+"</table></div>";
}
function cardsHTML(tab,rows){
  const cols=tab.cols;
  const tc=cols.find(c=>c.type!=="check")||cols[0];
  return '<div class="cards">'+rows.map(r=>{
    const title=tc?dispText(tc,r,tab):"";
    const rest=cols.filter(c=>c!==tc).map(c=>{
      const d=dispText(c,r,tab);
      if(!d)return "";
      if(c.type==="check")return '<span class="pill">✓ '+esc(c.name)+"</span>";
      return '<span class="kv"><small>'+esc(c.name)+'</small><b class="'+(isNumeric(c)?"num":"")+'">'+esc(d)+"</b></span>";
    }).join("");
    return '<button class="card" data-act="editrow" data-id="'+r.id+'"><div class="ct">'+esc(title||"Sem título")+'</div><div class="kvs">'+rest+"</div></button>";
  }).join("")+"</div>";
}
function sumHTML(tab,rows){
  const parts=tab.cols.filter(c=>c.total).map(c=>'<div class="sumchip"><small>'+LBL[c.total]+" · "+esc(c.name)+"</small><b>"+fmtTotal(c,totalOf(c,rows,tab))+"</b></div>");
  return parts.length?'<div class="sumrow">'+parts.join("")+"</div>":"";
}
function renderGrid(){
  const t=curTool();if(!t)return;
  const tab=curTab(t);
  const g=$("#grid"),s=$("#sum");
  if(!g)return;
  if(state.rows==null){g.innerHTML='<p class="muted pad">Carregando…</p>';return}
  const all=state.rows.filter(r=>r.tab===tab.id).sort((a,b)=>(a.ord||0)-(b.ord||0));
  let rows=all;
  const q=state.q.trim().toLowerCase();
  if(q)rows=rows.filter(r=>tab.cols.some(c=>dispText(c,r,tab).toLowerCase().indexOf(q)>-1));
  const so=getSort(tab.id);
  if(so){const c=tab.cols.find(x=>x.id===so.col);if(c)rows=sortRows(rows,c,so.dir,tab)}
  s.innerHTML=state.mobile?sumHTML(tab,rows):"";
  if(!tab.cols.length){
    g.innerHTML='<div class="empty"><b>Esta aba ainda não tem colunas</b><p>Defina as colunas para começar a registrar.</p><button class="btn pri" data-act="cols">Criar colunas</button></div>';
  }else if(!all.length){
    g.innerHTML='<div class="empty"><b>Nenhum registro nesta aba</b><p>'+(state.mobile?"Toque no botão + para adicionar o primeiro.":"Clique em “Nova linha” e preencha com Tab entre as células.")+"</p></div>";
  }else if(!rows.length){
    g.innerHTML='<p class="muted pad">Nada encontrado para essa busca.</p>';
  }else{
    g.innerHTML=state.mobile?cardsHTML(tab,rows):tableHTML(tab,rows);
  }
  if(state.focusRow){
    const tr=g.querySelector('tr[data-id="'+state.focusRow+'"]');
    if(tr){
      const ins=Array.prototype.slice.call(tr.querySelectorAll("input:not([type=checkbox]),select"));
      const el=ins.find(i=>!i.value)||ins[0];
      state.focusRow=null;
      if(el){el.focus();tr.scrollIntoView({block:"nearest"})}
    }
  }
}

/* ---------- ações sobre linhas ---------- */
async function addRow(){
  const t=curTool();if(!t)return;
  const tab=curTab(t);
  if(!tab.cols.length){openCols();return}
  if(state.mobile){openRowForm(null);return}
  const id=uid(),cells={};
  tab.cols.forEach(c=>{if(c.type==="date")cells[c.id]=todayISO()});
  state.focusRow=id;
  await safe(()=>store.setRow(t.id,id,{tab:tab.id,ord:Date.now(),cells:cells}));
}
async function delRow(id){
  const t=curTool();if(!t||!state.rows)return;
  const r=state.rows.find(x=>x.id===id);if(!r)return;
  const backup={tab:r.tab,ord:r.ord||Date.now(),cells:clone(r.cells||{})};
  await safe(()=>store.delRow(t.id,id));
  toast("Registro excluído",{label:"Desfazer",fn:()=>safe(()=>store.setRow(t.id,id,backup))});
}
function readInput(c,el){
  if(c.type==="check")return !!el.checked;
  if(c.type==="number"||c.type==="money")return parseNum(el.value);
  if(c.type==="text")return el.value.trim()||null;
  return el.value||null;
}

/* ---------- janelas ---------- */
function openModal(html,opts){
  opts=opts||{};
  layer.innerHTML='<div class="scrim" data-act="close"><div class="sheet'+(opts.wide?" wide":"")+'" role="dialog" aria-modal="true" aria-label="'+esc(opts.label||"")+'">'+html+"</div></div>";
  document.body.classList.add("lock");
  const f=layer.querySelector("[data-first]");
  if(f)f.focus();
}
function closeModal(){layer.innerHTML="";document.body.classList.remove("lock");state.m=null}

function pickersHTML(icon,hue){
  return '<div class="field"><span>Ícone</span><div class="icons" id="icons">'+ICONS.map(i=>'<button type="button" class="pickb'+(i===icon?" on":"")+'" data-act="pickicon" data-v="'+i+'" aria-label="Ícone '+i+'">'+i+"</button>").join("")+"</div></div>"+
    '<div class="field"><span>Cor</span><div class="swatches" id="swatches">'+HUES.map((h,i)=>'<button type="button" class="sw'+(i===hue?" on":"")+'" data-act="pickhue" data-v="'+i+'" style="--h:'+h+'" aria-label="Cor '+(i+1)+'"></button>').join("")+"</div></div>";
}

function openNewTool(){
  state.m={icon:"📋",hue:0,tpl:"blank"};
  openModal('<form data-form="newtool"><h2>Nova ferramenta</h2><div class="tplgrid">'+
    TEMPLATES.map(tp=>'<label class="tpl"><input type="radio" name="tpl" value="'+tp.key+'"'+(tp.key==="blank"?" checked":"")+'><span class="tpl-in"><i class="ico" style="--h:'+HUES[tp.hue]+'">'+tp.icon+"</i><b>"+esc(tp.name)+"</b><small>"+esc(tp.desc)+"</small></span></label>").join("")+"</div>"+
    '<label class="field"><span>Nome</span><input name="name" data-first autocomplete="off" required value="Em branco"></label>'+pickersHTML("📋",0)+
    '<div class="actions"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Criar</button></div></form>',{label:"Nova ferramenta"});
}
async function createTool(name,icon,hue,key){
  const tp=TEMPLATES.find(x=>x.key===key)||TEMPLATES[0];
  const id=uid();
  await safe(()=>store.setTool(id,{name:name||tp.name,icon:icon,hue:hue,ord:Date.now(),tabs:tp.tabs()}));
  closeModal();
  setView(id);
}
function openToolSettings(){
  const t=curTool();if(!t)return;
  state.m={icon:t.icon||"📋",hue:t.hue||0,armed:false};
  openModal('<form data-form="toolset"><h2>Ajustes da ferramenta</h2><label class="field"><span>Nome</span><input name="name" data-first autocomplete="off" required value="'+esc(t.name)+'"></label>'+pickersHTML(state.m.icon,state.m.hue)+
    '<div class="actions"><button type="button" class="btn danger" data-act="deltool" id="deltool">Excluir ferramenta</button><span class="sp"></span><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Salvar</button></div></form>',{label:"Ajustes da ferramenta"});
}
function openNewTab(){
  openModal('<form data-form="newtab"><h2>Nova aba</h2><label class="field"><span>Nome da aba</span><input name="name" data-first autocomplete="off" required placeholder="Ex.: Gastos"></label><p class="hint">A aba começa com duas colunas, Item e Valor. Ajuste em “Colunas”.</p><div class="actions"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Criar aba</button></div></form>',{label:"Nova aba"});
}
function openTabSettings(){
  const t=curTool();if(!t)return;
  const tab=curTab(t);
  state.m={armed:false};
  openModal('<form data-form="tabset"><h2>Ajustes da aba</h2><label class="field"><span>Nome da aba</span><input name="name" data-first autocomplete="off" required value="'+esc(tab.name)+'"></label>'+
    '<div class="actions">'+((t.tabs||[]).length>1?'<button type="button" class="btn danger" data-act="deltab" id="deltab">Excluir aba</button>':"")+'<span class="sp"></span><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Salvar</button></div></form>',{label:"Ajustes da aba"});
}

/* colunas */
let cm=null;
function openCols(){
  const t=curTool();if(!t)return;
  const tab=curTab(t);
  cm={tabId:tab.id,cols:clone(tab.cols)};
  openModal('<form data-form="cols"><h2>Colunas de “'+esc(tab.name)+'”</h2><div id="clist"></div>'+
    '<div class="actions"><button type="button" class="btn" data-act="caddcol">+ Coluna</button><span class="sp"></span><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Salvar</button></div></form>',{wide:true,label:"Colunas"});
  drawCols();
}
function totalOptions(c){
  const all=isNumeric(c)||c.type==="check"?["","sum","avg","min","max","count"]:["","count"];
  return all.map(k=>'<option value="'+k+'"'+((c.total||"")===k?" selected":"")+">"+(k?"Total: "+LBL[k]:"Sem total")+"</option>").join("");
}
function drawCols(){
  $("#clist").innerHTML=cm.cols.map((c,i)=>'<div class="crow" data-i="'+i+'"><div class="crow-main"><input data-f="name" aria-label="Nome da coluna" value="'+esc(c.name)+'" placeholder="Nome"><select data-f="type" aria-label="Tipo">'+
    Object.keys(TYPES).map(k=>'<option value="'+k+'"'+(c.type===k?" selected":"")+">"+TYPES[k]+"</option>").join("")+"</select></div>"+
    (c.type==="select"?'<input data-f="opts" aria-label="Opções" placeholder="Opções separadas por vírgula" value="'+esc((c.opts||[]).join(", "))+'">':"")+
    (c.type==="formula"?'<input data-f="formula" aria-label="Fórmula" placeholder="Ex.: ({Valor}+{Passagem})/{Km}" value="'+esc(c.formula||"")+'"><select data-f="fmt" aria-label="Formato do resultado"><option value="number"'+((c.fmt||"number")==="number"?" selected":"")+'>Resultado: número</option><option value="money"'+(c.fmt==="money"?" selected":"")+'>Resultado: dinheiro</option><option value="percent"'+(c.fmt==="percent"?" selected":"")+'>Resultado: porcentagem</option></select><p class="hint">Escreva o nome de outra coluna entre chaves, como {Valor}, e use + − × ÷ e parênteses. Se renomear a coluna, ajuste aqui também.</p>':"")+
    '<div class="crow-foot"><select data-f="total" aria-label="Total no rodapé">'+totalOptions(c)+'</select><button type="button" data-act="cup" data-i="'+i+'" aria-label="Mover para a esquerda">←</button><button type="button" data-act="cdown" data-i="'+i+'" aria-label="Mover para a direita">→</button><button type="button" class="dt" data-act="cdel" data-i="'+i+'">Excluir</button></div></div>').join("")||'<p class="muted">Nenhuma coluna ainda.</p>';
}

/* formulário de registro (celular) */
function fieldHTML(c,v,first){
  const id="f_"+c.id, fa=first?" data-first":"";
  const lab='<span>'+esc(c.name)+"</span>";
  switch(c.type){
    case "check":return '<label class="field chk"><input type="checkbox" id="'+id+'" data-col="'+c.id+'"'+(v?" checked":"")+">"+lab+"</label>";
    case "select":{
      const opts=(c.opts||[]).slice();if(v&&opts.indexOf(v)<0)opts.push(v);
      return '<label class="field">'+lab+'<select id="'+id+'" data-col="'+c.id+'"><option value=""></option>'+opts.map(o=>'<option value="'+esc(o)+'"'+(o===v?" selected":"")+">"+esc(o)+"</option>").join("")+"</select></label>";
    }
    case "number":case "money":
      return '<label class="field">'+lab+'<input id="'+id+'" data-col="'+c.id+'" inputmode="decimal" autocomplete="off"'+fa+' placeholder="'+(c.type==="money"?"0,00":"0")+'" value="'+esc(fmtRaw(v))+'"></label>';
    case "date":return '<label class="field">'+lab+'<input type="date" id="'+id+'" data-col="'+c.id+'" value="'+esc(v||"")+'"></label>';
    case "time":return '<label class="field">'+lab+'<input type="time" id="'+id+'" data-col="'+c.id+'" value="'+esc(v||"")+'"></label>';
    default:return '<label class="field">'+lab+'<input type="text" id="'+id+'" data-col="'+c.id+'" autocomplete="off"'+fa+' value="'+esc(v==null?"":v)+'"></label>';
  }
}
function openRowForm(rowId){
  const t=curTool();if(!t)return;
  const tab=curTab(t);
  const r=rowId&&state.rows?state.rows.find(x=>x.id===rowId):null;
  state.m={rowId:rowId||null,tabId:tab.id};
  const cols=tab.cols.filter(c=>c.type!=="formula");
  const firstText=cols.find(c=>c.type==="text"||c.type==="number"||c.type==="money");
  openModal('<form data-form="row"><h2>'+(r?"Editar registro":"Novo registro")+"</h2>"+
    cols.map(c=>{
      let v=r&&r.cells?r.cells[c.id]:null;
      if(!r&&c.type==="date")v=todayISO();
      return fieldHTML(c,v,c===firstText&&!r);
    }).join("")+
    '<div class="actions">'+(r?'<button type="button" class="btn danger" data-act="delrowform">Excluir</button>':"")+'<span class="sp"></span><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Salvar</button></div></form>',{label:"Registro"});
}

/* ---------- eventos ---------- */
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-act]");
  if(!b)return;
  if(b.classList.contains("scrim")&&e.target!==b)return;
  const a=b.dataset.act, t=curTool();
  switch(a){
    case "home":setView("home");break;
    case "open":setView(b.dataset.id);break;
    case "newtool":openNewTool();break;
    case "tpl":{const tp=TEMPLATES.find(x=>x.key===b.dataset.key);createTool(tp.name,tp.icon,tp.hue,tp.key);break}
    case "toolset":openToolSettings();break;
    case "newtab":openNewTab();break;
    case "tab":LS.set("mp.tab."+t.id,b.dataset.id);state.q="";state.sig=null;render();break;
    case "tabset":openTabSettings();break;
    case "cols":openCols();break;
    case "addrow":addRow();break;
    case "editrow":openRowForm(b.dataset.id);break;
    case "delrow":delRow(b.dataset.id);break;
    case "sort":{
      const tab=curTab(t),so=getSort(tab.id);
      if(!so||so.col!==b.dataset.col)setSort(tab.id,{col:b.dataset.col,dir:1});
      else if(so.dir===1)setSort(tab.id,{col:b.dataset.col,dir:-1});
      else setSort(tab.id,null);
      renderGrid();break;
    }
    case "close":closeModal();break;
    case "pickicon":{state.m.icon=b.dataset.v;layer.querySelectorAll('[data-act="pickicon"]').forEach(x=>x.classList.toggle("on",x===b));break}
    case "pickhue":{state.m.hue=+b.dataset.v;layer.querySelectorAll('[data-act="pickhue"]').forEach(x=>x.classList.toggle("on",x===b));break}
    case "deltool":{
      if(!state.m.armed){state.m.armed=true;b.textContent="Toque de novo para excluir";setTimeout(()=>{if(state.m&&b.isConnected){state.m.armed=false;b.textContent="Excluir ferramenta"}},4000);break}
      const id=t.id;closeModal();setView("home");
      safe(()=>store.delTool(id)).then(()=>toast("Ferramenta excluída"));break;
    }
    case "deltab":{
      if(!state.m.armed){state.m.armed=true;b.textContent="Toque de novo para excluir";setTimeout(()=>{if(state.m&&b.isConnected){state.m.armed=false;b.textContent="Excluir aba"}},4000);break}
      const tab=curTab(t),ids=(state.rows||[]).filter(r=>r.tab===tab.id).map(r=>r.id);
      const tabs=t.tabs.filter(x=>x.id!==tab.id);
      closeModal();
      safe(async()=>{await store.patchTool(t.id,{tabs:clone(tabs)});for(const id of ids)await store.delRow(t.id,id)}).then(()=>toast("Aba excluída"));break;
    }
    case "delrowform":{const id=state.m.rowId;closeModal();delRow(id);break}
    case "caddcol":cm.cols.push({id:uid(),name:"Coluna "+(cm.cols.length+1),type:"text"});drawCols();break;
    case "cup":{const i=+b.dataset.i;if(i>0){const x=cm.cols[i];cm.cols[i]=cm.cols[i-1];cm.cols[i-1]=x;drawCols()}break}
    case "cdown":{const i=+b.dataset.i;if(i<cm.cols.length-1){const x=cm.cols[i];cm.cols[i]=cm.cols[i+1];cm.cols[i+1]=x;drawCols()}break}
    case "cdel":cm.cols.splice(+b.dataset.i,1);drawCols();break;
  }
});

layer.addEventListener("change",e=>{
  const el=e.target;
  if(el.name==="tpl"){
    const tp=TEMPLATES.find(x=>x.key===el.value);
    state.m.tpl=tp.key;state.m.icon=tp.icon;state.m.hue=tp.hue;
    const f=layer.querySelector('[name="name"]');if(f)f.value=tp.name;
    layer.querySelectorAll('[data-act="pickicon"]').forEach(x=>x.classList.toggle("on",x.dataset.v===tp.icon));
    layer.querySelectorAll('[data-act="pickhue"]').forEach(x=>x.classList.toggle("on",+x.dataset.v===tp.hue));
    return;
  }
  const row=el.closest(".crow");
  if(row&&el.dataset.f){
    const c=cm.cols[+row.dataset.i],f=el.dataset.f;
    if(f==="opts")c.opts=el.value.split(",").map(s=>s.trim()).filter(Boolean);
    else if(f==="total")c.total=el.value||undefined;
    else c[f]=el.value;
    if(f==="type"){if(c.type==="select"&&!c.opts)c.opts=[];if(c.type==="formula"&&!c.fmt)c.fmt="number";drawCols()}
  }
});
layer.addEventListener("input",e=>{
  const el=e.target,row=el.closest(".crow");
  if(row&&el.dataset.f&&(el.dataset.f==="name"||el.dataset.f==="formula")){cm.cols[+row.dataset.i][el.dataset.f]=el.value}
});
layer.addEventListener("submit",e=>{
  e.preventDefault();
  const f=e.target,k=f.dataset.form,t=curTool(),fd=new FormData(f);
  if(k==="newtool"){createTool((fd.get("name")||"").trim(),state.m.icon,state.m.hue,state.m.tpl);return}
  if(k==="toolset"){
    const name=(fd.get("name")||"").trim()||t.name,icon=state.m.icon,hue=state.m.hue;
    closeModal();safe(()=>store.patchTool(t.id,{name:name,icon:icon,hue:hue}));return;
  }
  if(k==="newtab"){
    const name=(fd.get("name")||"").trim();if(!name)return;
    const tab={id:uid(),name:name,cols:[col("Item","text"),col("Valor","money",{total:"sum"})]};
    LS.set("mp.tab."+t.id,tab.id);state.sig=null;
    closeModal();safe(()=>store.patchTool(t.id,{tabs:clone((t.tabs||[]).concat([tab]))}));return;
  }
  if(k==="tabset"){
    const name=(fd.get("name")||"").trim();if(!name)return;
    const id=curTab(t).id,tabs=clone(t.tabs);tabs.forEach(x=>{if(x.id===id)x.name=name});
    closeModal();safe(()=>store.patchTool(t.id,{tabs:tabs}));return;
  }
  if(k==="cols"){
    const cols=cm.cols.map((c,i)=>{
      const o=clone(c);o.name=(o.name||"").trim()||"Coluna "+(i+1);
      if(o.type!=="select")delete o.opts;
      if(o.type!=="formula"){delete o.formula;delete o.fmt}
      if(!o.total)delete o.total;
      return o;
    });
    const tabs=clone(t.tabs);tabs.forEach(x=>{if(x.id===cm.tabId)x.cols=cols});
    state.sig=null;
    closeModal();safe(()=>store.patchTool(t.id,{tabs:tabs}));return;
  }
  if(k==="row"){
    const tab=(t.tabs||[]).find(x=>x.id===state.m.tabId)||curTab(t),cells={};
    tab.cols.forEach(c=>{
      if(c.type==="formula")return;
      const el=f.querySelector('[data-col="'+c.id+'"]');if(!el)return;
      cells[c.id]=readInput(c,el);
    });
    const rid=state.m.rowId;
    closeModal();
    if(rid)safe(()=>store.patchCells(t.id,rid,cells));
    else safe(()=>store.setRow(t.id,uid(),{tab:tab.id,ord:Date.now(),cells:cells}));
  }
});

/* edição direta na tabela */
main.addEventListener("change",e=>{
  const el=e.target,tr=el.closest&&el.closest("tr[data-id]");
  if(!tr||!el.dataset.col)return;
  const t=curTool();if(!t)return;
  const c=curTab(t).cols.find(x=>x.id===el.dataset.col);if(!c)return;
  const v=readInput(c,el);
  safe(()=>store.patchCells(t.id,tr.dataset.id,{[c.id]:v}));
  if((c.type==="number"||c.type==="money")&&document.activeElement!==el)el.value=fmtNum(c.type,v);
});
main.addEventListener("focusin",e=>{
  const el=e.target;
  if(!el.dataset||!el.dataset.t)return;
  const tr=el.closest("tr[data-id]"),t=curTool();if(!tr||!t||!state.rows)return;
  const r=state.rows.find(x=>x.id===tr.dataset.id),c=curTab(t).cols.find(x=>x.id===el.dataset.col);
  if(!r||!c)return;
  el.value=fmtRaw(r.cells?r.cells[c.id]:null);
  el.select();
});
main.addEventListener("focusout",()=>{
  setTimeout(()=>{if(state.dirty&&!editingNow()){state.dirty=false;render()}},0);
});
main.addEventListener("keydown",e=>{
  if(e.key!=="Enter")return;
  const el=e.target;
  if(!el.dataset||!el.dataset.col||el.tagName==="SELECT")return;
  const tr=el.closest("tr[data-id]");if(!tr)return;
  e.preventDefault();
  const next=tr.nextElementSibling,cid=el.dataset.col;
  el.blur();
  if(next){const n=next.querySelector('[data-col="'+cid+'"]');if(n)n.focus()}
});
main.addEventListener("input",e=>{
  if(e.target.id==="q"){state.q=e.target.value;renderGrid()}
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&layer.firstChild)closeModal()});
mq.addEventListener("change",()=>{state.mobile=mq.matches;state.sig=null;render()});

/* ---------- início ---------- */
render();
(async function boot(){
  let db = window.db || null;
  
  store = db ? cloudStore(db) : localStore();
  syncEl.dataset.k = db ? "cloud" : "local";
  syncEl.textContent = db ? "Sincronizado" : "Só neste aparelho";
  
  store.watchTools(list=>{
    list.sort((a,b)=>(a.ord||0)-(b.ord||0));
    list.forEach(t=>{t.tabs=t.tabs||[];state.known.add(t.id)});
    state.tools=list;
    if(!state.init){
      state.init=true;
      const saved=LS.get("mp.view");
      if(saved&&list.some(t=>t.id===saved)){setView(saved);return}
    }
    if(state.view!=="home"&&!list.some(t=>t.id===state.view)&&state.known.has(state.view)){setView("home");return}
    render();
  });
})();
})();