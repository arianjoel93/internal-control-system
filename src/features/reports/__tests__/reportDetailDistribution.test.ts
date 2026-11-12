import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCustomerSellerDistribution, buildCrmSellerDistribution } from '../reportDetailDistribution.ts';
import type { AgentCrmLeadDetail, AgentCustomerLifecycleDetail } from '../reportExecutiveModel.ts';

function customer(sellerName: string, status: AgentCustomerLifecycleDetail['status']): AgentCustomerLifecycleDetail {
  return { customer: 'Cliente', sellerName, status, email: null, phone: null, lastPurchaseDate: '2026-10-01', daysSincePurchase: 7, averageRepurchaseDays: 30, thresholdDays: 90, value: 100 };
}

function lead(sellerId: number, sellerName: string, attended: boolean): AgentCrmLeadDetail {
  return { label: 'Lead', customer: 'Cliente', stage: 'Nuevo', attended, createdAt: '2026-10-01', creatorName: 'Marketing', sellerId, sellerName };
}

test('la distribución de clientes coincide con los detalles y separa cada estado', () => {
  const rows = [customer('Ana', 'Nuevo'), customer('Ana', 'A reactivar'), customer('Luis', 'Perdido'), customer('Ana', 'Reactivado')];
  const distribution = buildCustomerSellerDistribution(rows);
  assert.deepEqual(distribution.map(({ name, total }) => [name, total]), [['Ana', 3], ['Luis', 1]]);
  assert.deepEqual(distribution[0] && [distribution[0].newCount, distribution[0].reactivated, distribution[0].toReactivate, distribution[0].lost], [1, 1, 1, 0]);
  assert.equal(distribution.reduce((sum, seller) => sum + seller.total, 0), rows.length);
});

test('los vendedores de leads se ordenan por porcentaje de atención y no por volumen', () => {
  const rows = [lead(1, 'Ana', true), lead(1, 'Ana', false), lead(2, 'Luis', true), lead(2, 'Luis', true), lead(3, 'Eva', false)];
  const distribution = buildCrmSellerDistribution(rows);
  assert.deepEqual(distribution.map(({ name, assigned, attended, unattended, attentionRate }) => [name, assigned, attended, unattended, attentionRate]), [
    ['Luis', 2, 2, 0, 100], ['Ana', 2, 1, 1, 50], ['Eva', 1, 0, 1, 0],
  ]);
  assert.equal(distribution.reduce((sum, seller) => sum + seller.assigned, 0), rows.length);
});
