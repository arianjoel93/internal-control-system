import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeOdooEmail,
  resolveServerCompanyIds,
  resolveServerSellerIds,
  selectExactActiveOdooUsers,
  shouldUseOwnReportScope,
} from '../../../../supabase/functions/odoo-sales-report/salesperson-scope.ts';

test('normaliza el correo sin alterar su identidad', () => {
  assert.equal(normalizeOdooEmail('  Vendedor@Tectronic.MX  '), 'vendedor@tectronic.mx');
});

test('acepta una coincidencia exacta por login o correo sin distinguir mayúsculas', () => {
  const matches = selectExactActiveOdooUsers(
    [
      {
        id: 10,
        active: true,
        login: 'VENDEDOR@TECTRONIC.MX',
        email: 'otro@tectronic.mx',
      },
      {
        id: 11,
        active: true,
        login: 'otro.usuario',
        email: 'vendedor@tectronic.mx',
      },
    ],
    ' vendedor@tectronic.mx ',
  );

  assert.deepEqual(matches.map((row) => row.id), [10, 11]);
});

test('rechaza coincidencias parciales, usuarios archivados y filas sin id válido', () => {
  const matches = selectExactActiveOdooUsers(
    [
      { id: 20, active: true, login: 'vendedor@tectronic.mx.extra' },
      { id: 21, active: false, email: 'vendedor@tectronic.mx' },
      { id: null, active: true, email: 'vendedor@tectronic.mx' },
    ],
    'vendedor@tectronic.mx',
  );

  assert.deepEqual(matches, []);
});

test('mantiene las coincidencias duplicadas como ambiguas cuando son usuarios distintos', () => {
  const matches = selectExactActiveOdooUsers(
    [
      { id: 30, active: true, login: 'vendedor@tectronic.mx' },
      { id: 31, active: true, email: 'VENDEDOR@TECTRONIC.MX' },
      { id: 30, active: true, login: 'vendedor@tectronic.mx' },
    ],
    'vendedor@tectronic.mx',
  );

  assert.deepEqual(matches.map((row) => row.id), [30, 31]);
});

test('el alcance propio ignora cualquier vendedor enviado por el navegador', () => {
  assert.deepEqual(
    resolveServerSellerIds({
      requestedSellerIds: [999, 1000],
      resolvedSellerId: 42,
      visibilityScope: 'own',
    }),
    [42],
  );
});

test('el alcance propio falla cerrado cuando no hay vendedor resuelto', () => {
  assert.deepEqual(
    resolveServerSellerIds({
      requestedSellerIds: [999],
      resolvedSellerId: null,
      visibilityScope: 'own',
    }),
    [],
  );
});

test('el alcance global conserva el filtro elegido por gerentes y propietarios', () => {
  assert.deepEqual(
    resolveServerSellerIds({
      requestedSellerIds: [7, 4, 7, '9'],
      resolvedSellerId: null,
      visibilityScope: 'all',
    }),
    [7, 4, 9],
  );
});

test('el alcance propio impone la compañía principal de Odoo', () => {
  assert.deepEqual(
    resolveServerCompanyIds({
      requestedCompanyIds: [999, 1000],
      resolvedCompanyId: 6,
      visibilityScope: 'own',
    }),
    [6],
  );
});

test('el alcance global conserva las compañías elegidas sin duplicados', () => {
  assert.deepEqual(
    resolveServerCompanyIds({
      requestedCompanyIds: [8, 4, 8, '9'],
      resolvedCompanyId: null,
      visibilityScope: 'all',
    }),
    [8, 4, 9],
  );
});

test('el alcance global conserva la selección explícita de ningún elemento', () => {
  assert.deepEqual(
    resolveServerSellerIds({
      requestedSellerIds: [-1],
      resolvedSellerId: null,
      visibilityScope: 'all',
    }),
    [-1],
  );
  assert.deepEqual(
    resolveServerCompanyIds({
      requestedCompanyIds: [-1],
      resolvedCompanyId: null,
      visibilityScope: 'all',
    }),
    [-1],
  );
});

test('administradores, propietarios y gerentes conservan la vista global', () => {
  assert.equal(shouldUseOwnReportScope('admin', 'own'), false);
  assert.equal(shouldUseOwnReportScope('owner', 'own'), false);
  assert.equal(shouldUseOwnReportScope('manager', 'own'), false);
});

test('agentes de ventas y permisos solo propios usan el alcance restringido', () => {
  assert.equal(shouldUseOwnReportScope('sales_agent', 'all'), true);
  assert.equal(shouldUseOwnReportScope('support_agent', 'own'), true);
});
