import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketingReportHtml } from '../marketingReportDocument.ts';

test('el reporte compartido contiene gráficas, cifras y tablas autocontenidas', () => {
  const html = buildMarketingReportHtml({
    title: 'Marketing · Mis Leads',
    period: 'octubre 2026',
    scope: 'Compañía: Tectronic',
    sections: [{
      title: 'Mi impacto',
      metrics: [{ label: 'Facturado', value: '$10,000' }],
      charts: [
        { kind: 'donut', title: 'Cierres', value: 4, total: 5, primaryLabel: 'Ganados', secondaryLabel: 'Perdidos' },
        { kind: 'bars', title: 'Origen', bars: [{ label: 'Web', value: 3, display: '3' }] },
        { kind: 'trend', title: 'Valor', primaryLabel: 'Cotizado', comparisonLabel: 'Facturado',
          points: [{ label: 'Semana 1', value: 100, display: '$100', comparison: 80, comparisonDisplay: '$80' }] },
      ],
      tables: [{ title: 'Detalle', columns: ['Lead', 'Estado'], rows: [['Cliente Uno', 'Ganado']] }],
    }],
  });

  assert.match(html, /<svg[^>]*class="trend"/);
  assert.match(html, /donut-fill/);
  assert.match(html, /Origen/);
  assert.match(html, /Facturado: \$80/);
  assert.match(html, /Cliente Uno/);
  assert.match(html, /<style>/);
});

test('escapa nombres externos de Odoo antes de publicarlos en un enlace', () => {
  const html = buildMarketingReportHtml({
    title: 'Resumen <b>privado</b>', period: 'octubre', scope: 'Cliente <script>alert(1)</script>',
    sections: [{ title: 'Leads', tables: [{ title: 'Detalle', columns: ['Nombre'], rows: [['<img src=x onerror=alert(1)>']] }] }],
  });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});
