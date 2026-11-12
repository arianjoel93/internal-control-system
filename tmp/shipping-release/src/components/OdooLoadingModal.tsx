import { useEffect, useState } from 'react';
import { Database, LoaderCircle } from 'lucide-react';

const operationalIdeas = [
  'Idea comercial: revisa cada semana los clientes con compras recurrentes que ya superaron su tiempo promedio de recompra.',
  'Idea de ventas: separa clientes nuevos, activos y en riesgo para que cada vendedor tenga una acción clara por cartera.',
  'Idea de proceso: convierte las cotizaciones sin respuesta en una lista diaria de seguimiento antes de que cumplan 7 días.',
  'Idea de dirección: compara ventas facturadas contra el mismo periodo del año anterior para distinguir crecimiento real de temporada alta.',
  'Idea de rentabilidad: revisa productos con alto volumen y bajo total sin impuestos para ajustar precios, descuentos o mezcla comercial.',
  'Idea de cartera: identifica clientes que compran menos cada mes y agenda un contacto preventivo antes de perder recurrencia.',
  'Idea operativa: usa rankings por categoría para saber qué vendedores sostienen cada línea de producto y dónde falta especialización.',
  'Idea de control: prioriza acciones donde coincidan baja conversión, muchas cotizaciones y clientes con historial de compra.',
];
let nextIdeaIndex = 0;

export function OdooLoadingModal({
  open,
  title = 'Procesando información de Odoo',
}: {
  open: boolean;
  title?: string;
}) {
  const [currentIdea, setCurrentIdea] = useState(operationalIdeas[0]);

  useEffect(() => {
    if (!open) return;
    const ideaIndex = nextIdeaIndex % operationalIdeas.length;
    nextIdeaIndex += 1;
    const timerId = window.setTimeout(() => {
      setCurrentIdea(operationalIdeas[ideaIndex]);
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [open]);

  if (!open) return null;

  return (
    <div className="odoo-loading-backdrop" role="presentation">
      <section
        className="odoo-loading-modal"
        role="alertdialog"
        aria-live="assertive"
        aria-modal="true"
        aria-labelledby="odoo-loading-title"
        aria-describedby="odoo-loading-description"
      >
        <div className="odoo-loading-illustration" aria-hidden="true">
          <Database size={34} />
          <LoaderCircle className="odoo-loading-spinner" size={22} />
        </div>
        <p className="eyebrow">Conexión segura en curso</p>
        <h2 id="odoo-loading-title">{title}</h2>
        <p id="odoo-loading-description">{currentIdea}</p>
        <div className="odoo-loading-progress" aria-hidden="true">
          <span />
        </div>
      </section>
    </div>
  );
}
