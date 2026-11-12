import { applyHeightCuts, suggestHeightReduction } from '../../../supabase/functions/_shared/shipping-packing';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Box, Maximize2, RotateCcw } from 'lucide-react';
import { sumProductVolumetricWeight, type PackingLine, type PackingPackage, type PackingPlan } from '../../../supabase/functions/_shared/shipping-packing';
import { buildPackingScene, packingProductColors, projectScenePoint, type SceneItem, type ScenePoint } from './shippingPackingScene';
import './shippingPackingViewer.css';

const number = (n: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 }).format(n);
type Camera = { yaw: number; pitch: number; zoom: number };
const initialCamera: Camera = { yaw: -.6, pitch: .5, zoom: 1 };
type Face = { points: Array<{ x: number; y: number }>; depth: number; color: string; alpha: number; id?: string };

function drawScene(canvas: HTMLCanvasElement, pkg: PackingPackage, camera: Camera, transparent: boolean,
  selected: string | null, items: SceneItem[], colors: Map<string,string>, showCut = false) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return [];
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
  const d = pkg.internalDimensions, outer = pkg.externalDimensions;
  const extent = Math.max(outer.length, outer.width, outer.height, 1);
  const scale = Math.min(width / (extent * 1.9), height / (extent * 1.65)) * camera.zoom;
  const center = { x: d.length / 2, y: d.height / 2, z: d.width / 2 };
  const project = (point: ScenePoint) => {
    const p = projectScenePoint({ x: point.x - center.x, y: point.y - center.y, z: point.z - center.z }, camera.yaw, camera.pitch);
    return { x: width / 2 + p.x * scale, y: height * .52 - p.y * scale, depth: p.depth };
  };
  const faces: Face[] = [];
  const add = (points: ScenePoint[], color: string, alpha: number, id?: string) => {
    const projected = points.map(project);
    faces.push({ points: projected, depth: projected.reduce((sum, p) => sum + p.depth, 0) / points.length, color, alpha, id });
  };
  function box(c: ScenePoint, l: number, w: number, h: number, color: string, alpha: number, id?: string) {
    const vertices = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
      .map(([x,y,z]) => ({ x: c.x + x * l / 2, y: c.y + y * h / 2, z: c.z + z * w / 2 }));
    [[0,1,2,3],[4,5,6,7],[0,4,7,3],[1,5,6,2],[0,1,5,4],[3,2,6,7]].forEach(face => add(face.map(i => vertices[i]), color, alpha, id));
  }
  function roll(item: SceneItem, color: string) {
    const { length: l, width: w, height: h } = item.size, c = item.center;
    const point = (angle: number, end: number, factor = 1): ScenePoint => {
      const u = Math.cos(angle) * factor, v = Math.sin(angle) * factor;
      return item.rollAxis === 'x' ? { x: c.x + end * l / 2, y: c.y + u * h / 2, z: c.z + v * w / 2 }
        : item.rollAxis === 'z' ? { x: c.x + u * l / 2, y: c.y + v * h / 2, z: c.z + end * w / 2 }
          : { x: c.x + u * l / 2, y: c.y + end * h / 2, z: c.z + v * w / 2 };
    };
    const segments = 16;
    for (let i = 0; i < segments; i++) {
      const a = i * Math.PI * 2 / segments, b = (i + 1) * Math.PI * 2 / segments;
      add([point(a,-1),point(b,-1),point(b,1),point(a,1)], color, 1, item.id);
    }
    for (const end of [-1,1]) {
      add(Array.from({ length: segments }, (_, i) => point(i * Math.PI * 2 / segments, end)), color, 1, item.id);
      add(Array.from({ length: segments }, (_, i) => point(i * Math.PI * 2 / segments, end * 1.002, .18)), '#8b704f', 1, item.id);
    }
  }
  ctx.strokeStyle = '#cad5e3'; ctx.lineWidth = .6;
  for (let i = -2; i <= 12; i++) {
    const v = i * extent / 10;
    for (const pair of [[{ x: v, y: -.5, z: -extent*.2 }, { x: v, y: -.5, z: extent*1.2 }],
      [{ x: -extent*.2, y: -.5, z: v }, { x: extent*1.2, y: -.5, z: v }]]) {
      const [a,b] = pair.map(project); ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
  }
  for (const item of items) {
    const color = colors.get(item.productKey) ?? '#799bd3';
    if (item.shape === 'roll' && items.length <= 120) roll(item, color);
    else box(item.center, item.size.length, item.size.width, item.size.height, color, 1, item.id);
  }
  // The carton is visual only: it never changes positions, contents, or shipment mass.
  if (pkg.packagingTypeId) box(center, outer.length, outer.width, outer.height, '#b69061', transparent ? .075 : 1);
  const cut = showCut ? suggestHeightReduction(pkg) : null;
  if(cut) box({x:center.x,y:(cut.internalHeight+d.height)/2,z:center.z},d.length,d.width,d.height-cut.internalHeight,'#ef9d36',.22);
  faces.sort((a,b) => a.depth - b.depth);
  for (const face of faces) {
    ctx.beginPath();face.points.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));ctx.closePath();
    ctx.globalAlpha=face.alpha;ctx.fillStyle=face.color;ctx.fill();
    ctx.globalAlpha=face.alpha < 1 ? .3 : .7;ctx.strokeStyle=face.id===selected?'#17345c':'#556b88';ctx.lineWidth=face.id===selected?2:.6;ctx.stroke();
  }
  ctx.globalAlpha=1;
  if(cut){
    const corners=[{x:0,y:cut.internalHeight,z:0},{x:d.length,y:cut.internalHeight,z:0},{x:d.length,y:cut.internalHeight,z:d.width},{x:0,y:cut.internalHeight,z:d.width}].map(project);
    ctx.strokeStyle='#b76a12';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();ctx.setLineDash([]);
  }
  const x0=center.x-outer.length/2, y0=center.y-outer.height/2, z0=center.z+outer.width/2, gap=extent*.12;
  const dimension=(a:ScenePoint,b:ScenePoint,label:string)=>{
    const p=project(a),q=project(b);ctx.strokeStyle='#526981';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
    const len=Math.hypot(q.x-p.x,q.y-p.y)||1,tx=-(q.y-p.y)/len*4,ty=(q.x-p.x)/len*4;
    for(const v of [p,q]){ctx.beginPath();ctx.moveTo(v.x-tx,v.y-ty);ctx.lineTo(v.x+tx,v.y+ty);ctx.stroke();}
    ctx.font='12px system-ui';const tw=ctx.measureText(label).width;
    const x=Math.max(8,Math.min(width-tw-8,(p.x+q.x)/2-tw/2)),y=Math.max(16,Math.min(height-12,(p.y+q.y)/2));
    ctx.fillStyle='rgba(248,250,253,.95)';ctx.fillRect(x-4,y-13,tw+8,19);ctx.fillStyle='#304964';ctx.fillText(label,x,y);
  };
  dimension({x:x0,y:y0-gap,z:z0+gap},{x:x0+outer.length,y:y0-gap,z:z0+gap},`Largo ${number(outer.length)} cm`);
  dimension({x:x0-gap,y:y0-gap,z:z0},{x:x0-gap,y:y0-gap,z:z0-outer.width},`Ancho ${number(outer.width)} cm`);
  dimension({x:x0+outer.length+gap,y:y0,z:z0+gap},{x:x0+outer.length+gap,y:y0+outer.height,z:z0+gap},`Alto ${number(outer.height)} cm`);
  return transparent || !pkg.packagingTypeId ? faces.filter(f => f.id) : [];
}

export function ShippingPackingViewer({ plan, lines = [], disabledHeightCuts = [], onHeightCut }: { plan: PackingPlan; lines?: PackingLine[]; disabledHeightCuts?:string[]; onHeightCut?:(id:string,enabled:boolean)=>void }) {
  const [packageId, setPackageId] = useState<string | null>(null);
  const [camera, setCamera] = useState(initialCamera);
  const [transparent, setTransparent] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localDisabled,setLocalDisabled] = useState<string[]>([]);
  const disabledCuts = onHeightCut ? disabledHeightCuts : localDisabled;
  const effectivePlan = applyHeightCuts(plan,disabledCuts);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const facesRef = useRef<Face[]>([]);
  const drag = useRef<{ x: number; y: number; distance: number } | null>(null);
  const inputId = useId();
  const pkg = plan.packages.find(p => p.id === packageId) ?? plan.packages[0];
  const items = useMemo(() => pkg ? buildPackingScene(pkg) : [], [pkg]);
  const colors = useMemo(() => packingProductColors(plan.packages), [plan.packages]);
  const legend = useMemo(() => [...new Map(plan.packages.flatMap(p=>p.items.map(i=>[String(i.unit.productId||i.unit.sku||i.unit.id),i.unit.sku||i.unit.productName] as const))).entries()], [plan.packages]);
  const selected = items.find(item => item.id === selectedId);
  const cut = pkg ? suggestHeightReduction(pkg) : null;
  const showCut = !!pkg && !!cut && !disabledCuts.includes(pkg.id);
  const productVolumetric = useMemo(()=>sumProductVolumetricWeight(lines),[lines]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pkg) return;
    let frame = 0;
    const render = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { facesRef.current = drawScene(canvas, pkg, camera, transparent, selectedId, items, colors, showCut); }); };
    const observer = new ResizeObserver(render);observer.observe(canvas);render();
    return () => { observer.disconnect();cancelAnimationFrame(frame); };
  }, [pkg, camera, transparent, selectedId, items, colors, showCut]);
  if (!pkg) return <p className="shipping-quotes-muted">Completa los datos de los productos para visualizar el embalaje.</p>;
  function pick(x: number, y: number) {
    for (const face of [...facesRef.current].reverse()) {
      let inside = false;
      for (let i=0,j=face.points.length-1;i<face.points.length;j=i++) {
        const a=face.points[i],b=face.points[j];
        if ((a.y>y)!==(b.y>y) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) inside=!inside;
      }
      if (inside) { setSelectedId(face.id ?? null);return; }
    }
    setSelectedId(null);
  }
  return <section className="shipping-3d" aria-label="Vista tridimensional del embalaje">
    <div className="shipping-3d-package-picker" aria-label="Paquete a visualizar">{plan.packages.map((p,index) =>
      <button type="button" key={p.id} aria-pressed={p.id === pkg.id} onClick={() => { setPackageId(p.id);setSelectedId(null); }}>
        <Box size={16} />Paquete {index+1}<span>{number(p.totalWeight)} kg</span>
      </button>)}</div>
    <div className="shipping-3d-layout"><div className="shipping-3d-main">
      <div className="shipping-3d-stage"><div className="shipping-3d-stage-head"><strong>{pkg.packagingName}</strong><span>Vista 3D · {pkg.items.length} unidades ubicadas</span></div>
        <canvas ref={canvasRef} role="img" aria-label={`${pkg.packagingName}: ${pkg.items.length} unidades logísticas. Usa los controles de giro y la lista de contenido para inspeccionar.`}
          onPointerDown={event => { drag.current={ x:event.clientX,y:event.clientY,distance:0 };event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={event => { const p=drag.current;if(!p)return;const dx=event.clientX-p.x,dy=event.clientY-p.y;p.distance+=Math.abs(dx)+Math.abs(dy);p.x=event.clientX;p.y=event.clientY;
            setCamera(c => ({ ...c,yaw:c.yaw+dx*.009,pitch:Math.max(-.25,Math.min(1.48,c.pitch+dy*.008)) })); }}
          onPointerUp={event => { const moved=drag.current?.distance ?? 0;drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
            if(moved<5){const rect=event.currentTarget.getBoundingClientRect();pick(event.clientX-rect.left,event.clientY-rect.top);} }}
          onPointerCancel={() => {drag.current=null;}}>
          {pkg.items.map(item => item.unit.productName).join(', ')}
        </canvas>
        <div className="shipping-3d-stage-foot"><span>Arrastra para girar · Selecciona un producto</span><span>{number(pkg.externalDimensions.length)} × {number(pkg.externalDimensions.width)} × {number(pkg.externalDimensions.height)} cm externos</span></div>
      </div>
      <div className="shipping-3d-controls">
        <button type="button" className="secondary-button" disabled={!pkg.packagingTypeId} aria-pressed={!!pkg.packagingTypeId&&transparent} onClick={() => setTransparent(v=>!v)}>{!pkg.packagingTypeId?'Empaque cerrado':transparent?'Caja transparente':'Caja opaca'}</button>
        <button type="button" className="secondary-button" onClick={() => setCamera(c=>({...c,pitch:1.48}))}><Maximize2 size={15}/>Vista superior</button>
        <button type="button" className="secondary-button" onClick={() => setCamera(initialCamera)}><RotateCcw size={15}/>Restablecer vista</button>
        <label htmlFor={`${inputId}-rotate`}>Giro<input id={`${inputId}-rotate`} type="range" min={-180} max={180} value={Math.round(((camera.yaw*180/Math.PI+180)%360+360)%360-180)} onChange={e=>setCamera(c=>({...c,yaw:Number(e.target.value)*Math.PI/180}))}/></label>
        <label htmlFor={`${inputId}-zoom`}>Zoom {Math.round(camera.zoom*100)} %<input id={`${inputId}-zoom`} type="range" min={60} max={145} value={Math.round(camera.zoom*100)} onChange={e=>setCamera(c=>({...c,zoom:Number(e.target.value)/100}))}/></label>
      </div>
      <p className="shipping-3d-disclaimer">Posiciones del acomodo calculado. Los rollos se representan con formas simplificadas dentro de su espacio reservado{items.length>120?' (bloques para mantener fluidez en este paquete)':''}. Las presentaciones cerradas se muestran como bloques, sin inventar su distribución interior. Validar en almacén.</p>
      <p className="shipping-3d-selection" aria-live="polite">{selected ? `${selected.label}${selected.closed?' · Empaque cerrado':''}` : 'Selecciona un producto para identificarlo.'}</p>
      <div className="shipping-3d-product-legend" aria-label="Colores por producto">{legend.map(([key,label])=><span key={key}><i style={{background:colors.get(key)}} aria-hidden="true"/>{label}</span>)}</div>
      {cut?<section className="shipping-cut-proposal"><label><input type="checkbox" checked={showCut} onChange={event=>{if(onHeightCut)onHeightCut(pkg.id,event.target.checked);else setLocalDisabled(event.target.checked?disabledCuts.filter(id=>id!==pkg.id):[...disabledCuts,pkg.id]);if(event.target.checked)setTransparent(true);}}/>Aplicar recorte sugerido para cotizar</label>
        {showCut?<><strong>Recorte sugerido de altura: {number(cut.removableCm)} cm</strong><span>Altura exterior propuesta: {number(cut.externalHeight)} cm · Reducción volumétrica estimada: {number(cut.volumetricSavingKg)} kg.</span><small>La zona naranja y la línea indican una propuesta. Reserva 2 cm sobre el contenido protegido. Almacén debe validar solapas, resistencia y medidas finales. La cotización usa la altura recortada mientras esta opción esté activada.</small></>:null}
      </section>:null}
    </div><aside className="shipping-3d-summary" aria-label="Resumen del envío">
      <span className="shipping-3d-caption">Resumen del envío</span>
      <div className="shipping-3d-weight-pair">
        <div><strong className="shipping-3d-weight">{number(plan.metrics.grossWeight)} <small>kg</small></strong><span className="shipping-3d-caption">Peso bruto calculado</span></div>
        <div title="Suma del peso volumétrico individual por cantidad física. Dimensiones redondeadas al centímetro y divisor 5000; sin caja exterior ni protección adicional."><strong className="shipping-3d-weight">{productVolumetric.weightKg===null?'—':number(productVolumetric.weightKg)}{productVolumetric.weightKg!==null?<small> kg</small>:null}</strong><span className="shipping-3d-caption">Σ Peso volumétrico de productos</span></div>
      </div>
      {productVolumetric.missingLines?<small className="shipping-3d-disclaimer">Pendiente: {productVolumetric.missingLines} producto(s) sin dimensiones o conversión completas.</small>:null}
      <dl><div><dt>Paquetes</dt><dd>{plan.packages.length}</dd></div><div><dt>Volumétrico base</dt><dd>{number(effectivePlan.metrics.volumetricWeight)} kg</dd></div></dl>
      <hr/><strong>Paquete seleccionado</strong><dl><div><dt>Contenido</dt><dd>{number(pkg.productsWeight)} kg</dd></div><div><dt>Caja adicional</dt><dd>{number(pkg.packagingWeight)} kg</dd></div><div><dt>Total</dt><dd>{number(pkg.totalWeight)} kg</dd></div></dl>
      <label className="field"><span>Contenido del paquete</span><select value={selected?.id ?? ''} onChange={e=>setSelectedId(e.target.value||null)}><option value="">Seleccionar producto</option>{items.map(item=><option key={item.id} value={item.id}>{item.label} · {item.id}</option>)}</select></label>
      <p className="shipping-3d-disclaimer">Las masas y medidas pueden incluir estimaciones del catálogo. El volumen adicional configurado se aplica en el resumen final antes de consultar FedEx.</p>
    </aside></div>
  </section>;
}
