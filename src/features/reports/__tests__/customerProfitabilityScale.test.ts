import assert from 'node:assert/strict';
import test from 'node:test';
import { cappedMarginPercent, createBalancedAxis } from '../customerProfitabilityScale.ts';

test('mantiene el umbral en el centro y preserva el orden de ventas reales', () => {
  const axis = createBalancedAxis(0, 100_000, 10_000_000);
  assert.equal(axis.toPlot(0), 0);
  assert.equal(axis.toPlot(100_000), 0.5);
  assert.equal(axis.toPlot(10_000_000), 1);
  assert.ok(axis.toPlot(50_000) < axis.toPlot(100_000));
  assert.ok(axis.toPlot(1_000_000) > axis.toPlot(100_000));
  for (const amount of [25_000, 100_000, 750_000, 9_000_000]) {
    assert.ok(Math.abs(axis.fromPlot(axis.toPlot(amount)) - amount) < 0.001);
  }
});

test('admite márgenes negativos sin alterar sus etiquetas porcentuales', () => {
  const axis = createBalancedAxis(-30, 25, 110);
  assert.equal(axis.toPlot(25), 0.5);
  assert.ok(axis.toPlot(-10) < 0.5);
  assert.ok(axis.toPlot(80) > 0.5);
  assert.ok(Math.abs(axis.fromPlot(axis.toPlot(-10)) + 10) < 0.001);
});

test('el tamaño visual depende del porcentaje de margen y limita extremos', () => {
  assert.equal(cappedMarginPercent(-12, 55), 0);
  assert.equal(cappedMarginPercent(25, 55), 25);
  assert.equal(cappedMarginPercent(90, 55), 55);
  assert.ok(cappedMarginPercent(50, 55) > cappedMarginPercent(25, 55));
});
