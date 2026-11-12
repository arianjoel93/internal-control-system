import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, CalendarDays, Printer } from 'lucide-react';
import { useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { getSharedSalesReport } from './salesReportsCollaborationService';

export function SharedSalesReportPage() {
  const { token = '' } = useParams();
  const reportFrameRef = useRef<HTMLIFrameElement>(null);
  const reportQuery = useQuery({
    queryKey: ['shared-sales-report', token],
    queryFn: () => getSharedSalesReport(token),
    enabled: Boolean(token),
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <main className="shared-report-page">
      <header className="shared-report-toolbar">
        <div>
          <span>Reporte comercial compartido</span>
          <strong>{reportQuery.data?.title ?? 'Corporación Tectronic'}</strong>
        </div>
        <div className="shared-report-toolbar-meta">
          {reportQuery.data ? (
            <>
              <span><Building2 size={15} /> {reportQuery.data.company_name}</span>
              <span><CalendarDays size={15} /> {reportQuery.data.report_period}</span>
            </>
          ) : null}
          <button
            type="button"
            className="secondary-button"
            disabled={!reportQuery.data}
            onClick={() => reportFrameRef.current?.contentWindow?.print()}
          >
            <Printer size={16} />
            Imprimir o guardar PDF
          </button>
          <Link className="shared-report-back" to="/">
            <ArrowLeft size={16} />
            Inicio
          </Link>
        </div>
      </header>

      {reportQuery.isLoading ? (
        <section className="shared-report-loading" aria-label="Cargando reporte">
          <div className="skeleton-card wide"></div>
          <div className="skeleton-card large"></div>
        </section>
      ) : null}

      {reportQuery.error || (!reportQuery.isLoading && !reportQuery.data) ? (
        <section className="shared-report-error">
          <EmptyState title="El reporte no está disponible">
            El enlace puede ser incorrecto, haber sido desactivado o no existir.
          </EmptyState>
        </section>
      ) : null}

      {reportQuery.data ? (
        <iframe
          ref={reportFrameRef}
          className="shared-report-frame"
          title={reportQuery.data.title}
          sandbox="allow-same-origin"
          srcDoc={reportQuery.data.report_html}
        />
      ) : null}
    </main>
  );
}
