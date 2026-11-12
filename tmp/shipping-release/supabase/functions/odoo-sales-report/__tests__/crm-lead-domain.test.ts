import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCrmLeadDomain } from '../core.ts';

const filters = {
  startDate: '2026-09-01',
  endDate: '2026-09-29',
  companyIds: [2],
  sellerIds: [5],
  visibilityScope: 'all',
};

function matchesDomain(domain: unknown[], record: Record<string, unknown>) {
  const tokens = [...domain];
  const read = (): boolean => {
    const token = tokens.shift();
    if (token === '|') {
      const left = read();
      const right = read();
      return left || right;
    }
    if (token === '&') {
      const left = read();
      const right = read();
      return left && right;
    }
    if (token === '!') return !read();
    assert.ok(Array.isArray(token));
    const [field, operator, expected] = token;
    const value = record[field];
    if (operator === 'in') return Array.isArray(expected) && expected.includes(value);
    if (operator === '=') return value === expected;
    if (operator === '>=') return typeof value === 'string' && value >= expected;
    if (operator === '<=') return typeof value === 'string' && value <= expected;
    throw new Error(`Operador no cubierto: ${operator}`);
  };
  const results: boolean[] = [];
  while (tokens.length) results.push(read());
  return results.every(Boolean);
}

test('Marketing consulta asignados y ganados del periodo aunque se hayan creado antes', () => {
  const domain = buildCrmLeadDomain({
    filters, leadCompanyField: 'company_id', leadSellerField: 'user_id', leadTeamField: 'team_id',
    ownUserIds: [], marketing: true, leadAssignmentField: 'date_open', invoiceCustomerIds: [10],
  });
  const base = { type: 'lead', create_date: '2026-05-01 12:00:00', write_date: '2026-09-12 12:00:00', active: true, company_id: 2, user_id: 5, partner_id: 11 };
  assert.equal(matchesDomain(domain, { ...base, date_open: '2026-09-10 12:00:00' }), true);
  assert.equal(matchesDomain(domain, { ...base, date_closed: '2026-09-12 12:00:00' }), true);
  assert.equal(matchesDomain(domain, { ...base, partner_id: 10 }), true);
  assert.equal(matchesDomain(domain, { ...base, write_date: '2026-06-01 12:00:00' }), true);
  assert.equal(matchesDomain(domain, { ...base, write_date: '2026-08-20 12:00:00' }), false);
  assert.equal(matchesDomain(domain, { ...base, date_open: '2026-09-10 12:00:00', company_id: 3 }), false);
  assert.equal(matchesDomain(domain, { ...base, date_open: '2026-09-10 12:00:00', user_id: 6 }), false);
});

test('Reportes consulta leads asignados en el periodo aunque se crearan antes o modificaran después', () => {
  const domain = buildCrmLeadDomain({
    filters, leadCompanyField: 'company_id', leadSellerField: 'user_id', leadTeamField: 'team_id',
    ownUserIds: [], leadAssignmentField: 'date_open',
  });
  const base = { type: 'opportunity', company_id: 2, user_id: 5, create_date: '2026-04-01 12:00:00', write_date: '2026-09-30 12:00:00' };
  assert.equal(matchesDomain(domain, { ...base, date_open: '2026-09-29 18:30:00' }), true);
  assert.equal(matchesDomain(domain, { ...base, date_open: '2026-08-20 12:00:00' }), false);
  assert.equal(matchesDomain(domain, { ...base, date_open: '2026-09-29 18:30:00', user_id: 6 }), false);
});
