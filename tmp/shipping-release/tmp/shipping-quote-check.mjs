// supabase/functions/shipping-quote/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

// supabase/functions/_shared/shipping-packing.ts
var EPS = 1e-7;
var MAX_PHYSICAL_UNITS = 2e3;
var STRATEGIES = ["BALANCED", "MIN_PACKAGES", "COMPACT", "CONSERVATIVE"];
var volume = (d) => d.length * d.width * d.height;
var positive = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
var nonNegative = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
var round = (v) => Math.round(v * 1e3) / 1e3;
function normalizePackaging(row) {
  const dimensionFactor = row.dimension_unit === "IN" ? 2.54 : 1;
  const weightFactor = row.weight_unit === "LB" ? 0.45359237 : 1;
  const internal = { length: Number(row.internal_length ?? row.length), width: Number(row.internal_width ?? row.width), height: Number(row.internal_height ?? row.height) };
  const external = { length: Number(row.external_length ?? row.length), width: Number(row.external_width ?? row.width), height: Number(row.external_height ?? row.height) };
  const fill = Number(row.max_fill_percent ?? 100);
  if (!Object.values(internal).every(positive) || !Object.values(external).every(positive) || row.empty_weight === null || !nonNegative(Number(row.empty_weight)) || !positive(Number(row.max_weight)) || Number(row.empty_weight) >= Number(row.max_weight) || !positive(fill) || fill > 100 || external.length < internal.length || external.width < internal.width || external.height < internal.height) return null;
  for (const key of ["length", "width", "height"]) {
    internal[key] *= dimensionFactor;
    external[key] *= dimensionFactor;
  }
  return {
    id: row.id,
    name: row.name,
    internal,
    external,
    tareKg: Number(row.empty_weight) * weightFactor,
    maxWeightKg: Number(row.max_weight) * weightFactor,
    maxUtilization: fill,
    cost: Math.max(0, Number(row.box_cost) || 0),
    priority: row.sort_order || 0
  };
}
function normalizePackingLines(lines, log) {
  const units = [];
  const missingLines = [];
  const seen = /* @__PURE__ */ new Set();
  const requestedCount = lines.reduce((sum2, line) => sum2 + (positive(line.quantity) ? line.quantity : 0), 0);
  if (requestedCount > MAX_PHYSICAL_UNITS) throw new Error(`La orden supera ${MAX_PHYSICAL_UNITS} unidades f\xEDsicas; divide el env\xEDo para validar el acomodo.`);
  for (const line of lines) {
    const missing = [
      !positive(line.lengthCm) && "largo",
      !positive(line.widthCm) && "ancho",
      !positive(line.heightCm) && "alto",
      !nonNegative(line.weightKg) && "peso f\xEDsico",
      (!Number.isInteger(line.quantity) || line.quantity <= 0) && "cantidad entera",
      line.protectionMarginCm != null && !nonNegative(line.protectionMarginCm) && "margen de protecci\xF3n",
      (!Number.isSafeInteger(line.lineId) || !Number.isSafeInteger(line.productId) || seen.has(line.lineId)) && "referencia de l\xEDnea \xFAnica"
    ].filter(Boolean);
    seen.add(line.lineId);
    if (missing.length) {
      missingLines.push({ lineId: line.lineId, name: line.productName, quantity: Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0, reason: `Datos f\xEDsicos incompletos: ${missing.join(", ")}.` });
      continue;
    }
    for (let i = 1; i <= line.quantity; i++) {
      units.push({
        id: `${line.lineId}:${line.productId}:${i}`,
        lineId: line.lineId,
        productId: line.productId,
        sku: line.sku,
        productName: line.productName,
        unitIndex: i,
        originalQuantity: line.quantity,
        weightKg: Number(line.weightKg),
        dimensions: { length: Number(line.lengthCm), width: Number(line.widthCm), height: Number(line.heightCm) },
        canRotate: line.canRotate !== false,
        canStack: line.canStack !== false,
        fragile: line.fragile === true,
        shipAlone: line.shipAlone === true,
        canCombine: line.canCombine !== false,
        packingGroup: line.packingGroup || null,
        protectionMarginCm: line.protectionMarginCm ?? 0
      });
    }
    log?.("ITEM_NORMALIZED", { lineId: line.lineId, quantity: line.quantity });
  }
  return { units, missingLines };
}
function orientations(unit) {
  const pad = (unit.protectionMarginCm ?? 0) * 2;
  const l = unit.dimensions.length + pad, w = unit.dimensions.width + pad, h = unit.dimensions.height + pad;
  const candidates = unit.canRotate !== false ? [[l, w, h], [l, h, w], [w, l, h], [w, h, l], [h, l, w], [h, w, l]] : [[l, w, h]];
  return [...new Map(candidates.map(([length, width, height]) => [`${length}:${width}:${height}`, { length, width, height }])).values()];
}
function ordered(units) {
  return units.slice().sort((a, b) => Number(b.shipAlone || b.canCombine === false) - Number(a.shipAlone || a.canCombine === false) || Math.max(...Object.values(b.dimensions)) - Math.max(...Object.values(a.dimensions)) || volume(b.dimensions) - volume(a.dimensions) || b.weightKg - a.weightKg || a.id.localeCompare(b.id));
}
function openBox(box) {
  return { box, placements: [], spaces: [{ x: 0, y: 0, z: 0, ...box.internal }], used: 0, weight: 0 };
}
function overlaps(a, b) {
  return a.x < b.x + b.length - EPS && a.x + a.length > b.x + EPS && a.y < b.y + b.width - EPS && a.y + a.width > b.y + EPS && a.z < b.z + b.height - EPS && a.z + a.height > b.z + EPS;
}
function contains(a, b) {
  return a.x <= b.x + EPS && a.y <= b.y + EPS && a.z <= b.z + EPS && a.x + a.length + EPS >= b.x + b.length && a.y + a.width + EPS >= b.y + b.width && a.z + a.height + EPS >= b.z + b.height;
}
function supported(pkg, item, position, d) {
  if (position.z <= EPS) return true;
  if (item.canStack === false || item.fragile) return false;
  const supports = pkg.placements.filter((p) => Math.abs(p.position.z + p.orientation.height - position.z) < EPS && p.unit.canStack !== false && !p.unit.fragile);
  const area = supports.reduce((sum2, p) => sum2 + Math.max(0, Math.min(position.x + d.length, p.position.x + p.orientation.length) - Math.max(position.x, p.position.x)) * Math.max(0, Math.min(position.y + d.width, p.position.y + p.orientation.width) - Math.max(position.y, p.position.y)), 0);
  return area + EPS >= d.length * d.width;
}
function findPlacement(pkg, unit, strategy) {
  if (pkg.placements.length && (unit.shipAlone || unit.canCombine === false || pkg.placements.some((p) => p.unit.shipAlone || p.unit.canCombine === false))) return null;
  if (unit.packingGroup && pkg.placements.some((p) => p.unit.packingGroup && p.unit.packingGroup !== unit.packingGroup)) return null;
  if (pkg.weight + unit.weightKg + pkg.box.tareKg > pkg.box.maxWeightKg + EPS) return null;
  const fill = Math.min(
    pkg.box.maxUtilization,
    strategy === "CONSERVATIVE" ? 80 : 100,
    unit.fragile || pkg.placements.some((p) => p.unit.fragile) ? 80 : 100
  );
  const candidates = [];
  for (const d of orientations(unit)) {
    if (pkg.used + volume(d) > volume(pkg.box.internal) * fill / 100 + EPS) continue;
    for (const s of pkg.spaces) {
      if (d.length > s.length + EPS || d.width > s.width + EPS || d.height > s.height + EPS) continue;
      const pos = { x: s.x, y: s.y, z: s.z };
      if (!supported(pkg, unit, pos, d) || pkg.placements.some((p) => overlaps({ ...p.position, ...p.orientation }, { ...pos, ...d }))) continue;
      candidates.push({ unit, position: pos, orientation: d, score: s.z * 1e9 + (volume(s) - volume(d)) + (s.length - d.length + s.width - d.width + s.height - d.height) * 1e-3 });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.position.y - b.position.y || a.position.x - b.position.x);
  const candidate = candidates[0];
  return candidate ? { unit: candidate.unit, position: candidate.position, orientation: candidate.orientation } : null;
}
function place(pkg, p) {
  pkg.placements.push(p);
  pkg.weight += p.unit.weightKg;
  pkg.used += volume(p.orientation);
  const b = { ...p.position, ...p.orientation };
  const spaces = [];
  for (const s of pkg.spaces) {
    if (!overlaps(s, b)) {
      spaces.push(s);
      continue;
    }
    spaces.push(
      { ...s, length: b.x - s.x },
      { ...s, x: b.x + b.length, length: s.x + s.length - b.x - b.length },
      { ...s, width: b.y - s.y },
      { ...s, y: b.y + b.width, width: s.y + s.width - b.y - b.width },
      { ...s, height: b.z - s.z },
      { ...s, z: b.z + b.height, height: s.z + s.height - b.z - b.height }
    );
  }
  const unique = [...new Map(spaces.filter((s) => s.length > EPS && s.width > EPS && s.height > EPS).map((s) => [`${s.x}:${s.y}:${s.z}:${s.length}:${s.width}:${s.height}`, s])).values()];
  pkg.spaces = unique.filter((s, i) => !unique.some((other, j) => i !== j && contains(other, s))).sort((a, b2) => a.z - b2.z || volume(a) - volume(b2) || a.y - b2.y || a.x - b2.x).slice(0, 160);
}
function packed(pkg, id, own = false) {
  const utilization = pkg.used / volume(pkg.box.internal) * 100;
  const warnings = [];
  if (utilization >= pkg.box.maxUtilization * 0.92) warnings.push("Esta caja est\xE1 cerca del l\xEDmite de ocupaci\xF3n configurado.");
  if (pkg.placements.some((p) => p.unit.fragile)) warnings.push("Contenido fr\xE1gil: ocupaci\xF3n limitada al 80 % y sin carga encima.");
  if (own) warnings.push("Env\xEDo individual sin caja de cat\xE1logo confirmado por el usuario.");
  return {
    id,
    packagingTypeId: own ? null : pkg.box.id,
    packagingName: pkg.box.name,
    internalDimensions: pkg.box.internal,
    externalDimensions: pkg.box.external,
    items: pkg.placements,
    productsWeight: round(pkg.weight),
    packagingWeight: round(pkg.box.tareKg),
    totalWeight: round(pkg.weight + pkg.box.tareKg),
    maxWeight: pkg.box.maxWeightKg,
    usedVolume: round(pkg.used),
    availableVolume: round(volume(pkg.box.internal) * pkg.box.maxUtilization / 100),
    utilizationPercentage: round(utilization),
    packagingCost: pkg.box.cost,
    status: "PACKED",
    warnings,
    explanation: own ? "Se usar\xE1n las dimensiones propias de esta unidad." : pkg.explanation ?? "Distribuci\xF3n revisada: se validaron orientaci\xF3n, apoyo, peso y ocupaci\xF3n de cada unidad dentro de este embalaje."
  };
}
function finish(strategy, units, packages, missingLines, unpackedItems, errors) {
  const pv = packages.reduce((s, p) => s + volume(p.internalDimensions), 0);
  const warnings = [...new Set(packages.flatMap((p) => p.warnings))];
  return {
    version: 1,
    strategy,
    packages,
    missingLines,
    unpackedItems,
    errors,
    warnings,
    status: errors.length ? "INVALID_PACKING" : missingLines.length ? "PENDING_DATA" : unpackedItems.length ? "PARTIALLY_PACKED" : packages.length ? "READY_FOR_QUOTE" : "INVALID_PACKING",
    metrics: {
      articleCount: units.length + missingLines.reduce((sum2, line) => sum2 + line.quantity, 0),
      packageCount: packages.length,
      netWeight: round(units.reduce((s, u) => s + u.weightKg, 0)),
      grossWeight: round(packages.reduce((s, p) => s + p.totalWeight, 0)),
      productVolume: round(units.reduce((s, u) => s + volume(u.dimensions), 0)),
      packagingVolume: round(pv),
      averageUtilization: pv ? round(packages.reduce((s, p) => s + p.usedVolume, 0) / pv * 100) : 0,
      missingProducts: missingLines.length,
      unpackedCount: unpackedItems.length
    }
  };
}
function validatePackingAssignments(lines, rows, assignments, strategy) {
  if (!STRATEGIES.includes(strategy)) throw new Error("Estrategia de embalaje no v\xE1lida.");
  if (!Array.isArray(assignments) || assignments.length > MAX_PHYSICAL_UNITS) throw new Error("Distribuci\xF3n de paquetes no v\xE1lida.");
  const { units, missingLines } = normalizePackingLines(lines);
  const byId = new Map(units.map((u) => [u.id, u]));
  const seen = /* @__PURE__ */ new Set();
  const packageIds = /* @__PURE__ */ new Set();
  const packages = [];
  const errors = [];
  for (const a of assignments) {
    if (!a || typeof a.id !== "string" || !Array.isArray(a.unitIds) || a.unitIds.length > MAX_PHYSICAL_UNITS) throw new Error("Paquete no v\xE1lido.");
    if (packageIds.has(a.id)) errors.push("Hay identificadores de paquete duplicados.");
    packageIds.add(a.id);
    const assigned = [];
    for (const id of a.unitIds) {
      const u = byId.get(id);
      if (!u || seen.has(id)) {
        errors.push(`Unidad desconocida o duplicada: ${id}.`);
        continue;
      }
      seen.add(id);
      assigned.push(u);
    }
    let box = null;
    if (a.packagingTypeId) {
      const row = rows.find((r) => r.id === a.packagingTypeId && r.is_active);
      box = row ? normalizePackaging(row) : null;
    } else if (a.ownPackageConfirmed && assigned.length === 1) {
      const u = assigned[0];
      const d = orientations({ ...u, canRotate: false })[0];
      box = { id: a.id, name: "Paquete individual confirmado", internal: d, external: d, tareKg: 0, maxWeightKg: Math.max(u.weightKg, 1e-3), maxUtilization: 100, cost: 0, priority: 0 };
    }
    if (!box) {
      errors.push(`${a.id}: selecciona un embalaje activo o confirma un paquete individual con sus dimensiones.`);
      continue;
    }
    if (!assigned.length) {
      errors.push(`${a.id}: la caja est\xE1 vac\xEDa; agrega un art\xEDculo o elim\xEDnala.`);
      continue;
    }
    const pkg = openBox(box);
    let invalid = false;
    for (const u of ordered(assigned)) {
      const p = findPlacement(pkg, u, strategy);
      if (!p) {
        errors.push(`${u.productName}: no cabe de forma segura en ${box.name}.`);
        invalid = true;
      } else place(pkg, p);
    }
    const result = packed(pkg, a.id, !a.packagingTypeId);
    if (invalid) result.status = "INVALID_PACKING";
    packages.push(result);
  }
  const unpacked = units.filter((u) => !seen.has(u.id)).map((unit) => ({ unit, code: "UNASSIGNED", reason: "Unidad pendiente de asignar a un paquete." }));
  return finish(strategy, units, packages, missingLines, unpacked, errors);
}
function mapPackingToShipment(plan, extraProtectionVolumeCm3 = 0) {
  if (plan.status !== "READY_FOR_QUOTE") throw new Error("Completa y valida la distribuci\xF3n antes de cotizar.");
  if (!nonNegative(extraProtectionVolumeCm3)) throw new Error("Volumen de protecci\xF3n no v\xE1lido.");
  return plan.packages.map((p) => {
    const { length, width, height } = p.externalDimensions;
    const addedHeight = extraProtectionVolumeCm3 / plan.packages.length / (length * width);
    return {
      id: p.id,
      packageTypeId: p.packagingTypeId,
      name: p.packagingName,
      quantity: 1,
      contentWeight: p.totalWeight,
      length: Math.ceil(length),
      width: Math.ceil(width),
      height: Math.ceil(height + addedHeight),
      dimensionUnit: "CM",
      weightUnit: "KG"
    };
  });
}

// supabase/functions/_shared/odoo-readonly.ts
var READ_ONLY_METHODS = /* @__PURE__ */ new Set(["search_read", "fields_get", "read_group"]);
var DEFAULT_PAGE_SIZE = 400;
function readOdooEnvironment() {
  return {
    apiKey: `${readRuntimeEnvironment("API_KEY_ODOO") ?? ""}`.trim(),
    database: `${readRuntimeEnvironment("ODOO_DB") ?? ""}`.trim(),
    url: trimSlash(readRuntimeEnvironment("ODOO_URL")),
    user: `${readRuntimeEnvironment("USER_ODOO") ?? ""}`.trim()
  };
}
function assertOdooEnvironment(environment) {
  if (!environment.url || !environment.user || !environment.apiKey) {
    throw new Error(
      "Faltan ODOO_URL, USER_ODOO o API_KEY_ODOO en los secrets de la Edge Function."
    );
  }
}
async function authenticateWithDatabaseCandidates({
  apiKey,
  configuredDatabase,
  odooUrl,
  user
}) {
  const attempts = [];
  let lastError = null;
  for (const candidateUrl of getOdooUrlCandidates(odooUrl)) {
    const discoveredDatabases = await discoverOdooDatabases(candidateUrl);
    const databaseCandidates = [
      ...new Set([
        `${configuredDatabase ?? ""}`.trim(),
        ...discoveredDatabases,
        ...getOdooDatabaseCandidates(candidateUrl, configuredDatabase)
      ].filter(Boolean))
    ];
    for (const database of databaseCandidates) {
      attempts.push(`${new URL(candidateUrl).hostname}/${database}`);
      try {
        const uid = await authenticateAgainstOdoo({
          apiKey,
          database,
          odooUrl: candidateUrl,
          user
        });
        return { database, odooUrl: candidateUrl, uid };
      } catch (error) {
        lastError = error;
      }
    }
  }
  const attempted = attempts.length ? attempts.join(", ") : "ninguna";
  throw new Error(
    `Odoo rechazo la autenticacion. Se probaron las conexiones ${attempted}. Verifica que ODOO_URL apunte a la misma instancia y que USER_ODOO/API_KEY_ODOO pertenezcan a esa base de datos.`,
    { cause: lastError }
  );
}
function fieldsGet({
  apiKey,
  database,
  model,
  odooUrl,
  uid
}) {
  return executeReadKw({
    apiKey,
    args: [],
    database,
    kwargs: { attributes: ["string", "type"] },
    method: "fields_get",
    model,
    odooUrl,
    uid
  });
}
async function searchReadAll({
  apiKey,
  database,
  domain,
  fields,
  model,
  odooUrl,
  order,
  pageSize = DEFAULT_PAGE_SIZE,
  uid
}) {
  const rows = [];
  let offset = 0;
  while (true) {
    const page = await executeReadKw({
      apiKey,
      args: [domain],
      database,
      kwargs: { fields, limit: pageSize, offset, ...order ? { order } : {} },
      method: "search_read",
      model,
      odooUrl,
      uid
    });
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += page.length;
  }
  return rows;
}
async function executeReadKw({
  apiKey,
  args,
  database,
  kwargs,
  method,
  model,
  odooUrl,
  uid
}) {
  if (!READ_ONLY_METHODS.has(method)) {
    throw new Error(`La integracion solo permite consultas de lectura en Odoo. Metodo bloqueado: ${method}.`);
  }
  return rpc(`${trimSlash(odooUrl)}/jsonrpc`, {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [database, uid, apiKey, model, method, args, kwargs]
    }
  });
}
async function discoverOdooDatabases(odooUrl) {
  try {
    const response = await fetch(`${trimSlash(odooUrl)}/web/database/list`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6e3)
    });
    if (!response.ok) return [];
    const payload = await response.json();
    const values = Array.isArray(payload) ? payload : payload?.result;
    return Array.isArray(values) ? values.map((value) => `${value ?? ""}`.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}
function getOdooUrlCandidates(configuredUrl) {
  const primaryUrl = trimSlash(configuredUrl);
  const url = new URL(primaryUrl);
  const explicitFallbacks = `${readRuntimeEnvironment("ODOO_FALLBACK_URLS") ?? ""}`.split(",").map(trimSlash).filter(Boolean);
  const sandboxMatch = url.hostname.toLowerCase().match(/^(.+?)-(?:sandbox|staging|test)-\d+\.(?:dev\.)?odoo\.com$/);
  const canonicalProductionUrl = sandboxMatch?.[1] ? `https://${sandboxMatch[1]}.odoo.com` : "";
  return [...new Set([primaryUrl, ...explicitFallbacks, canonicalProductionUrl].filter(Boolean))];
}
function readRuntimeEnvironment(name) {
  const runtime = globalThis;
  return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name];
}
function getOdooDatabaseCandidates(odooUrl, configuredDatabase = "") {
  const url = new URL(odooUrl);
  const fromQuery = url.searchParams.get("db") ?? url.searchParams.get("database") ?? url.hash.replace("#db=", "").trim();
  const hostMatch = url.hostname.toLowerCase().match(/^([^.]+)\.(?:dev\.)?odoo\.com$/);
  const fromOdooHost = hostMatch?.[1] ?? "";
  return [
    ...new Set(
      [fromQuery, fromOdooHost, configuredDatabase].map((value) => `${value ?? ""}`.trim()).filter(Boolean)
    )
  ];
}
async function authenticateAgainstOdoo({
  apiKey,
  database,
  odooUrl,
  user
}) {
  const uid = await rpc(`${trimSlash(odooUrl)}/jsonrpc`, {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "common",
      method: "authenticate",
      args: [database, user, apiKey, {}]
    }
  });
  if (!uid) {
    throw new Error(
      `Odoo rechazo la autenticacion para la base de datos "${database}". Verifica ODOO_URL, ODOO_DB, USER_ODOO y que API_KEY_ODOO pertenezca a ese usuario y siga activo.`
    );
  }
  return Number(uid);
}
async function rpc(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Odoo respondio ${response.status} ${response.statusText}.`);
  }
  const data = await response.json();
  if (data?.error) {
    const message = data.error?.data?.message?.trim() || data.error?.message?.trim() || "Odoo devolvio un error sin detalle.";
    throw new Error(data.error?.data?.name ? `${data.error.data.name}: ${message}` : message);
  }
  return data?.result;
}
function trimSlash(value) {
  return `${value ?? ""}`.trim().replace(/\/+$/, "");
}

// supabase/functions/_shared/fedex-estimator.ts
function scoreFedexCandidate(target, candidate) {
  const zone = target.fedexZone && candidate.fedexZone && target.fedexZone === candidate.fedexZone ? 40 : 0;
  const service = target.serviceCode && candidate.serviceCode && target.serviceCode === candidate.serviceCode ? 20 : 0;
  const weightDifference = relativeDifference(target.billableWeight, candidate.billableWeight);
  const weight = weightDifference <= 0.1 ? 20 : Math.max(0, 20 * (1 - weightDifference));
  const packageDifference = Math.abs(target.packageCount - candidate.packageCount);
  const packages = packageDifference === 0 ? 10 : packageDifference === 1 ? 5 : 0;
  const volumeDifference = relativeDifference(target.volumeCm3, candidate.volumeCm3);
  const volume2 = volumeDifference <= 0.2 ? 10 : Math.max(0, 10 * (1 - volumeDifference));
  return Math.max(0, Math.min(100, round2(zone + service + weight + packages + volume2, 2)));
}
function recencyWeight(createdAt, now = /* @__PURE__ */ new Date()) {
  const days = Math.max(0, (now.getTime() - new Date(createdAt).getTime()) / 864e5);
  if (days <= 30) return 1;
  if (days <= 90) return 0.9;
  if (days <= 180) return 0.8;
  return 0.7;
}
function estimateFedexHistory(target, candidates) {
  const now = target.now ?? /* @__PURE__ */ new Date();
  const comparable = candidates.filter((candidate) => candidate.currency === target.currency && candidate.environment === target.environment).map((candidate) => {
    const weight = recencyWeight(candidate.createdAt, now);
    return {
      ...candidate,
      similarityScore: scoreFedexCandidate(target, candidate),
      recencyWeight: weight,
      weightedAmount: candidate.amount * weight
    };
  }).sort((left, right) => right.similarityScore - left.similarityScore || right.createdAt.localeCompare(left.createdAt)).slice(0, 10);
  if (!comparable.length) return emptyEstimate();
  const amounts = comparable.map((candidate) => candidate.amount).sort((left, right) => left - right);
  const q1 = percentile(amounts, 0.25);
  const q3 = percentile(amounts, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const outliers = comparable.filter((candidate) => amounts.length >= 4 && (candidate.amount < lowerFence || candidate.amount > upperFence));
  const inliers = comparable.filter((candidate) => !outliers.some((outlier) => outlier.id === candidate.id));
  const values = inliers.length ? inliers : comparable;
  const weightedMedianAmount = weightedMedian(values);
  const averageAmount = values.reduce((sum2, candidate) => sum2 + candidate.amount, 0) / values.length;
  const min = Math.min(...values.map((candidate) => candidate.amount));
  const max = Math.max(...values.map((candidate) => candidate.amount));
  const p25 = percentile(values.map((candidate) => candidate.amount).sort((left, right) => left - right), 0.25);
  const p75 = percentile(values.map((candidate) => candidate.amount).sort((left, right) => left - right), 0.75);
  const score = round2(weightedAverage(values.map((candidate) => [candidate.similarityScore, candidate.recencyWeight])), 2);
  const dispersion = weightedMedianAmount ? (p75 - p25) / weightedMedianAmount : 1;
  const confidence = confidenceLevel({ score, count: values.length, environment: target.environment, dispersion });
  return {
    estimatedAmount: round2(weightedMedianAmount, 4),
    estimatedLow: round2(p25, 4),
    estimatedHigh: round2(p75, 4),
    medianAmount: round2(median(values.map((candidate) => candidate.amount)), 4),
    averageAmount: round2(averageAmount, 4),
    minimumAmount: round2(min, 4),
    maximumAmount: round2(max, 4),
    p25Amount: round2(p25, 4),
    p75Amount: round2(p75, 4),
    confidence,
    confidenceScore: score,
    comparables: comparable.map((candidate) => ({ ...candidate, isOutlier: outliers.some((outlier) => outlier.id === candidate.id) })),
    outlierQuoteIds: outliers.map((candidate) => candidate.id)
  };
}
function confidenceLevel(input) {
  if (input.count < 3) return "INSUFICIENTE";
  if (input.environment === "SANDBOX") {
    if (input.count >= 8 && input.score >= 80 && input.dispersion <= 0.25) return "ALTA";
    if (input.count >= 5 && input.score >= 65) return "MEDIA";
    return "BAJA";
  }
  if (input.count >= 8 && input.score >= 85 && input.dispersion <= 0.2) return "MUY_ALTA";
  if (input.count >= 5 && input.score >= 70 && input.dispersion <= 0.35) return "ALTA";
  if (input.count >= 3 && input.score >= 55) return "MEDIA";
  return "BAJA";
}
function weightedMedian(candidates) {
  const ordered2 = candidates.slice().sort((left, right) => left.amount - right.amount);
  const totalWeight = ordered2.reduce((sum2, candidate) => sum2 + candidate.recencyWeight, 0);
  let cumulative = 0;
  for (const candidate of ordered2) {
    cumulative += candidate.recencyWeight;
    if (cumulative >= totalWeight / 2) return candidate.amount;
  }
  return ordered2[ordered2.length - 1]?.amount ?? 0;
}
function weightedAverage(values) {
  const weight = values.reduce((sum2, [, factor]) => sum2 + factor, 0);
  return weight ? values.reduce((sum2, [value, factor]) => sum2 + value * factor, 0) / weight : 0;
}
function percentile(values, position) {
  if (!values.length) return 0;
  const index = (values.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (index - lower);
}
function median(values) {
  return percentile(values.slice().sort((left, right) => left - right), 0.5);
}
function relativeDifference(left, right) {
  const divisor = Math.max(Math.abs(left), Math.abs(right), 1e-4);
  return Math.abs(left - right) / divisor;
}
function round2(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
function emptyEstimate() {
  return {
    estimatedAmount: null,
    estimatedLow: null,
    estimatedHigh: null,
    medianAmount: null,
    averageAmount: null,
    minimumAmount: null,
    maximumAmount: null,
    p25Amount: null,
    p75Amount: null,
    confidence: "INSUFICIENTE",
    confidenceScore: 0,
    comparables: [],
    outlierQuoteIds: []
  };
}

// supabase/functions/shipping-quote/index.ts
var FEDEX_RATE_ENDPOINT_PATH = "/rate/v1/rates/quotes";
var FEDEX_HTTP_TIMEOUT_MS = 6e3;
var FEDEX_MAX_ATTEMPTS = 4;
var ShippingError = class extends Error {
  status;
  code;
  retryable;
  providerStatus;
  diagnosticStage;
  environment;
  providerCode;
  providerMessage;
  providerTransactionId;
  providerEndpoint;
  constructor(message, options = {}) {
    super(message);
    this.name = "ShippingError";
    this.status = options.status ?? 500;
    this.code = options.code ?? "SHIPPING_ERROR";
    this.retryable = options.retryable ?? false;
    this.providerStatus = options.providerStatus ?? null;
    this.diagnosticStage = options.diagnosticStage;
    this.environment = options.environment;
    this.providerCode = options.providerCode;
    this.providerMessage = options.providerMessage;
    this.providerTransactionId = options.providerTransactionId;
    this.providerEndpoint = options.providerEndpoint;
  }
};
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var tokenCache = /* @__PURE__ */ new Map();
var tokenPromiseCache = /* @__PURE__ */ new Map();
var officialPackagingTypes = /* @__PURE__ */ new Set([
  "YOUR_PACKAGING",
  "FEDEX_ENVELOPE",
  "FEDEX_PAK",
  "FEDEX_BOX",
  "FEDEX_SMALL_BOX",
  "FEDEX_MEDIUM_BOX",
  "FEDEX_LARGE_BOX",
  "FEDEX_EXTRA_LARGE_BOX",
  "FEDEX_EXTRA_SMALL_BOX",
  "FEDEX_10KG_BOX",
  "FEDEX_25KG_BOX"
]);
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "M\xE9todo no permitido." }, 405);
  let stage = "SUPABASE_AUTH";
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Faltan variables de entorno de Supabase." }, 500);
    }
    const authorization = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } }
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const {
      data: { user },
      error: userError
    } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Sesi\xF3n no v\xE1lida." }, 401);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "bootstrap");
    const access = await getShippingAccess(adminClient, user.id, user.email, user.app_metadata);
    if (!access.canAccess) return jsonResponse({ error: "No tienes permisos para usar el Cotizador de Env\xEDos." }, 403);
    if (action === "bootstrap") {
      stage = "LOAD_FEDEX_CONFIG";
      const [settings, packageTypes] = await Promise.all([getCarrierSettings(adminClient), getPackageTypes(adminClient, access.isAdmin)]);
      return jsonResponse({
        data: {
          access,
          config: settings ? publicConfig(settings) : null,
          packageTypes
        }
      });
    }
    if (action === "deletePackageType") {
      if (!access.isAdmin) return jsonResponse({ error: "Solo administradores pueden eliminar embalajes." }, 403);
      const id = requiredText(body.id, "Selecciona un embalaje.");
      const { error } = await adminClient.from("shipping_package_types").delete().eq("id", id);
      if (error) throw error;
      await audit(adminClient, { actorId: user.id, actorEmail: user.email, action: "shipping.package_type.deleted", entityType: "shipping_package_types", entityId: id, previousValue: null, newValue: null });
      return jsonResponse({ data: { deleted: true } });
    }
    if (action === "saveConfig") {
      stage = "LOAD_FEDEX_CONFIG";
      if (!access.isAdmin) return jsonResponse({ error: "Solo administradores pueden configurar FedEx." }, 403);
      const settings = await saveCarrierSettings(adminClient, body, user.id, user.email);
      return jsonResponse({ data: { config: publicConfig(settings) } });
    }
    if (action === "testConnection") {
      stage = "LOAD_FEDEX_CONFIG";
      if (!access.isAdmin) return jsonResponse({ error: "Solo administradores pueden probar la conexi\xF3n." }, 403);
      const settings = await requireConfiguredSettings(adminClient, true);
      stage = "DECRYPT_CREDENTIALS";
      const fedexConfig = await decryptFedexConfig(settings);
      stage = "FEDEX_OAUTH";
      const token = await getFedexAccessToken(fedexConfig);
      const origin = {
        countryCode: settings.origin_country_code,
        postalCode: settings.origin_postal_code,
        stateOrProvinceCode: settings.origin_state_code,
        city: settings.origin_city,
        street: null
      };
      stage = "BUILD_RATE_PAYLOAD";
      const probePayload = buildFedexConnectionProbe(fedexConfig.accountNumber, origin, settings.pickup_type);
      console.info("[shipping-quote:diagnostic]", {
        stage,
        environment: settings.environment,
        endpoint: `${fedexConfig.baseUrl}${FEDEX_RATE_ENDPOINT_PATH}`,
        payload: sanitizeFedexPayload(probePayload)
      });
      stage = "FEDEX_RATE_REQUEST";
      const probe = await fetchFedexRates(fedexConfig, token, probePayload);
      stage = "NORMALIZE_RATES";
      if (!normalizeFedExRateResponse(probe).length) {
        throw new ShippingError("FedEx autentic\xF3 las credenciales, pero Rate API no devolvi\xF3 servicios para la prueba.", {
          status: 502,
          code: "FEDEX_NO_RATES",
          retryable: false,
          diagnosticStage: "NORMALIZE_RATES",
          environment: settings.environment,
          providerStatus: 200,
          providerEndpoint: `${fedexConfig.baseUrl}${FEDEX_RATE_ENDPOINT_PATH}`
        });
      }
      return jsonResponse({
        data: {
          message: `Autenticaci\xF3n y Rate API correctas con FedEx ${settings.environment === "SANDBOX" ? "Sandbox" : "Producci\xF3n"}.`
        }
      });
    }
    if (action === "savePackageType") {
      stage = "SAVE_QUOTE";
      if (!access.isAdmin) return jsonResponse({ error: "Solo administradores pueden modificar embalajes." }, 403);
      const packageType = await savePackageType(adminClient, body, user.id, user.email);
      return jsonResponse({ data: { packageType } });
    }
    if (action === "listProductDimensions") {
      stage = "LOAD_FEDEX_CONFIG";
      const result = await listProductDimensions(adminClient);
      return jsonResponse({ data: result });
    }
    if (action === "previewProductDimensionsImport") {
      stage = "LOAD_FEDEX_CONFIG";
      if (!access.isAdmin) return jsonResponse({ error: "Solo administradores pueden cargar bases de productos." }, 403);
      const result = await previewProductDimensionsImport(adminClient, body);
      return jsonResponse({ data: result });
    }
    if (action === "importProductDimensions") {
      stage = "SAVE_QUOTE";
      if (!access.isAdmin) return jsonResponse({ error: "Solo administradores pueden actualizar bases de productos." }, 403);
      const result = await importProductDimensions(adminClient, body, user.id, user.email);
      return jsonResponse({ data: result });
    }
    if (action === "saveProductDimension") {
      stage = "SAVE_QUOTE";
      if (!access.isAdmin) return jsonResponse({ error: "Solo administradores pueden editar bases de productos." }, 403);
      const product = await saveProductDimension(adminClient, body, user.id, user.email);
      return jsonResponse({ data: { product } });
    }
    if (action === "createQuote") {
      stage = "LOAD_FEDEX_CONFIG";
      const quote = await createQuote(adminClient, body, user.id, user.email ?? null);
      return jsonResponse({ data: { quote } });
    }
    if (["lookupOdooOrder", "lookupOrder", "findOdooOrder"].includes(action)) {
      stage = "LOAD_FEDEX_CONFIG";
      const result = await lookupOdooOrder(adminClient, body);
      return jsonResponse({ data: result });
    }
    if (action === "getFedexZone") {
      stage = "LOAD_FEDEX_CONFIG";
      const result = await resolveHistoricalZone(adminClient, body);
      return jsonResponse({ data: result });
    }
    if (action === "estimateHistoricalRate") {
      stage = "LOAD_FEDEX_CONFIG";
      const result = await estimateHistoricalRate(adminClient, body, user.id, user.email ?? null, access);
      return jsonResponse({ data: result });
    }
    if (action === "getHistoricalEstimateDetail") {
      stage = "LOAD_FEDEX_CONFIG";
      const result = await getHistoricalEstimateDetail(adminClient, body, user.id, access);
      if (!result) return jsonResponse({ error: "No se encontr\xF3 la estimaci\xF3n solicitada." }, 404);
      return jsonResponse({ data: result });
    }
    if (action === "listQuotes") {
      stage = "LOAD_FEDEX_CONFIG";
      const result = await listQuotes(adminClient, body, user.id, access);
      return jsonResponse({ data: result });
    }
    if (action === "getQuote") {
      stage = "LOAD_FEDEX_CONFIG";
      const quote = await getQuoteDetail(adminClient, String(body.id ?? ""), user.id, access);
      if (!quote) return jsonResponse({ error: "No se encontr\xF3 la cotizaci\xF3n solicitada." }, 404);
      return jsonResponse({ data: { quote } });
    }
    return jsonResponse({ error: "Acci\xF3n no soportada." }, 400);
  } catch (error) {
    const initialError = normalizeShippingError(error);
    const normalizedError = initialError.providerMessage ? normalizeShippingError(error, mapFedexError(error)) : initialError;
    console.error("[shipping-quote]", {
      stage,
      status: normalizedError.status,
      code: normalizedError.code,
      retryable: normalizedError.retryable,
      providerStatus: normalizedError.providerStatus,
      environment: normalizedError.environment ?? null,
      providerCode: normalizedError.providerCode ?? null,
      providerMessage: normalizedError.providerMessage ?? null,
      transactionId: normalizedError.providerTransactionId ?? null,
      endpoint: normalizedError.providerEndpoint ?? null,
      diagnosticStage: normalizedError.diagnosticStage ?? stage,
      error: sanitizeError(error)
    });
    return jsonResponse(
      {
        error: normalizedError.message,
        code: normalizedError.code,
        retryable: normalizedError.retryable,
        providerStatus: normalizedError.providerStatus,
        diagnosticStage: normalizedError.diagnosticStage ?? stage,
        environment: normalizedError.environment ?? null,
        providerCode: normalizedError.providerCode ?? null,
        providerMessage: normalizedError.providerMessage ?? null,
        transactionId: normalizedError.providerTransactionId ?? null,
        endpoint: normalizedError.providerEndpoint ?? null
      },
      normalizedError.status
    );
  }
});
async function getShippingAccess(adminClient, userId, email, appMetadata) {
  const metadata = isRecord(appMetadata) ? appMetadata : {};
  const metadataRole = readText(metadata.role)?.toLowerCase();
  const metadataUserType = readText(metadata.user_type)?.toLowerCase();
  const metadataIsAdmin = metadataRole === "owner" || metadataRole === "manager" || metadataUserType === "owner";
  const { data: permission, error: permissionError } = await adminClient.from("admin_module_permissions").select("role, user_type, is_active").eq("user_id", userId).maybeSingle();
  if (permissionError) throw permissionError;
  if (!permission && metadataIsAdmin) {
    return { canAccess: true, isAdmin: true, viewAll: true };
  }
  if (!permission || permission.is_active === false) {
    return { canAccess: false, isAdmin: false, viewAll: false };
  }
  const { data: item, error: itemError } = await adminClient.from("admin_module_permission_items").select("can_access, actions").eq("user_id", userId).eq("module_key", "shipping_quotes").maybeSingle();
  if (itemError) throw itemError;
  const isAdmin = metadataIsAdmin || permission.role === "owner" || permission.role === "manager" || permission.user_type === "owner";
  const actions = isRecord(item?.actions) ? item?.actions : {};
  return {
    canAccess: isAdmin || Boolean(item?.can_access),
    isAdmin,
    viewAll: isAdmin || actions.view_all === true || actions.viewAll === true
  };
}
async function getCarrierSettings(adminClient) {
  const { data, error } = await adminClient.from("shipping_carrier_settings").select("*").eq("carrier", "FEDEX").maybeSingle();
  if (error) throw error;
  return data;
}
async function requireConfiguredSettings(adminClient, allowInactive = false) {
  const settings = await getCarrierSettings(adminClient);
  if (!settings) throw new Error("Configura FedEx antes de cotizar.");
  if (!settings.is_active && !allowInactive) throw new Error("El Cotizador de Env\xEDos todav\xEDa no est\xE1 disponible. Contacta al administrador.");
  if (!settings.origin_postal_code || !settings.origin_country_code) {
    throw new Error("Falta configurar el origen predeterminado de FedEx.");
  }
  return settings;
}
async function getPackageTypes(adminClient, includeInactive) {
  let query = adminClient.from("shipping_package_types").select("*").order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
async function saveCarrierSettings(adminClient, body, userId, userEmail) {
  const current = await getCarrierSettings(adminClient);
  const environment = readEnum(body.environment, ["SANDBOX", "PRODUCTION"], "SANDBOX");
  const baseUrl = readText(body.fedex_base_url) ?? (environment === "PRODUCTION" ? "https://apis.fedex.com" : "https://apis-sandbox.fedex.com");
  const accountNumber = normalizeFedexAccountNumber(body.account_number);
  const previousPublic = current ? publicConfig(current) : null;
  const payload = {
    carrier: "FEDEX",
    environment,
    is_active: body.is_active === true,
    fedex_base_url: normalizeFedexBaseUrl(baseUrl, environment),
    origin_country_code: (readText(body.origin_country_code) ?? "MX").toUpperCase(),
    origin_postal_code: readText(body.origin_postal_code),
    origin_state_code: readText(body.origin_state_code)?.toUpperCase() ?? null,
    origin_city: readText(body.origin_city),
    origin_street: null,
    preferred_currency: (readText(body.preferred_currency) ?? "MXN").toUpperCase(),
    pickup_type: readText(body.pickup_type) ?? "USE_SCHEDULED_PICKUP",
    return_transit_times: body.return_transit_times !== false,
    rate_request_types: Array.isArray(body.rate_request_types) && body.rate_request_types.length ? body.rate_request_types.map((item) => String(item).toUpperCase()) : ["ACCOUNT", "LIST"],
    rate_display_option: readEnum(
      body.rate_display_option,
      ["LOWER_RATE", "SELECTED_RATES_INCLUDING_F1R", "SELECTED_RATES_EXCLUDING_F1R"],
      "SELECTED_RATES_EXCLUDING_F1R"
    ),
    weight_input_mode: readEnum(body.weight_input_mode, ["NET_CONTENT", "GROSS_PACKAGE"], "NET_CONTENT"),
    final_volume_padding_enabled: body.final_volume_padding_enabled !== false,
    final_padding_length_cm: nullableNonNegative(body.final_padding_length_cm) ?? 0,
    final_padding_width_cm: nullableNonNegative(body.final_padding_width_cm) ?? 0,
    final_padding_height_cm: nullableNonNegative(body.final_padding_height_cm) ?? 0,
    final_packaging_cost_enabled: body.final_packaging_cost_enabled !== false,
    final_packaging_material_cost: nullableNonNegative(body.final_packaging_material_cost) ?? 0,
    updated_by: userId
  };
  await assignEncryptedSecret(payload, "account_number", accountNumber, current?.account_number_encrypted ?? null);
  await assignEncryptedSecret(payload, "client_id", body.client_id, current?.client_id_encrypted ?? null);
  await assignEncryptedSecret(payload, "client_secret", body.client_secret, current?.client_secret_encrypted ?? null);
  payload.child_key_encrypted = null;
  payload.child_key_masked = null;
  payload.child_secret_encrypted = null;
  if (!current) payload.created_by = userId;
  const { data, error } = await adminClient.from("shipping_carrier_settings").upsert(payload, { onConflict: "carrier" }).select("*").single();
  if (error) throw error;
  await audit(adminClient, {
    actorId: userId,
    actorEmail: userEmail,
    action: "shipping.config.updated",
    entityType: "shipping_carrier_settings",
    entityId: String(data.id),
    previousValue: previousPublic,
    newValue: publicConfig(data)
  });
  tokenCache.clear();
  tokenPromiseCache.clear();
  return data;
}
async function savePackageType(adminClient, body, userId, userEmail) {
  const id = readText(body.id);
  const fedexPackagingType = (readText(body.fedex_packaging_type) ?? "YOUR_PACKAGING").toUpperCase();
  if (!officialPackagingTypes.has(fedexPackagingType)) {
    throw new Error("Selecciona un tipo de embalaje FedEx v\xE1lido.");
  }
  const payload = {
    carrier: "FEDEX",
    name: requiredText(body.name, "Indica el nombre del embalaje."),
    internal_code: requiredText(body.internal_code, "Indica el c\xF3digo interno.").toUpperCase(),
    description: readText(body.description),
    length: nullablePositive(body.internal_length) ?? nullablePositive(body.length),
    width: nullablePositive(body.internal_width) ?? nullablePositive(body.width),
    height: nullablePositive(body.internal_height) ?? nullablePositive(body.height),
    internal_length: nullablePositive(body.internal_length) ?? nullablePositive(body.length),
    internal_width: nullablePositive(body.internal_width) ?? nullablePositive(body.width),
    internal_height: nullablePositive(body.internal_height) ?? nullablePositive(body.height),
    external_length: nullablePositive(body.external_length) ?? nullablePositive(body.length),
    external_width: nullablePositive(body.external_width) ?? nullablePositive(body.width),
    external_height: nullablePositive(body.external_height) ?? nullablePositive(body.height),
    max_fill_percent: nullablePositive(body.max_fill_percent) ?? 100,
    box_cost: nullableNonNegative(body.box_cost),
    dimension_unit: readEnum(body.dimension_unit, ["CM", "IN"], "CM"),
    empty_weight: nullableNonNegative(body.empty_weight),
    weight_unit: readEnum(body.weight_unit, ["KG", "LB"], "KG"),
    max_weight: nullablePositive(body.max_weight),
    is_active: body.is_active === true,
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 100,
    fedex_packaging_type: fedexPackagingType,
    updated_by: userId
  };
  if (payload.is_active && (!payload.length || !payload.width || !payload.height || payload.empty_weight === null || !payload.max_weight)) {
    throw new Error("Para activar un embalaje debes capturar largo, ancho, alto, tara y peso m\xE1ximo.");
  }
  if (!normalizePackaging({ ...payload, id: id ?? "new" })) {
    throw new ShippingError("Completa las dimensiones internas y externas, la tara, el peso m\xE1ximo y la ocupaci\xF3n. Las medidas externas deben ser mayores o iguales a las internas; el peso m\xE1ximo debe superar la tara.", { status: 400, code: "INVALID_PACKAGING" });
  }
  const query = id ? adminClient.from("shipping_package_types").update(payload).eq("id", id).select("*").single() : adminClient.from("shipping_package_types").insert({ ...payload, created_by: userId }).select("*").single();
  const { data, error } = await query;
  if (error) throw error;
  await audit(adminClient, {
    actorId: userId,
    actorEmail: userEmail,
    action: id ? "shipping.package_type.updated" : "shipping.package_type.created",
    entityType: "shipping_package_types",
    entityId: String(data.id),
    previousValue: null,
    newValue: data
  });
  return data;
}
async function listProductDimensions(adminClient) {
  const { data, error, count } = await adminClient.from("shipping_product_dimensions").select("*", { count: "exact" }).order("updated_at", { ascending: false }).limit(12);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}
async function previewProductDimensionsImport(adminClient, body) {
  const fileName = requiredText(body.fileName, "Selecciona un archivo Excel v\xE1lido.");
  const fileBase64 = requiredText(body.fileBase64, "No se pudo leer el archivo Excel.");
  const parsed = parseProductDimensionsWorkbook(fileBase64);
  const normalizedSkus = parsed.rows.map((row) => normalizeSku(row.sku));
  const { data: existingRows, error } = normalizedSkus.length ? await adminClient.from("shipping_product_dimensions").select("*").in("normalized_sku", normalizedSkus) : { data: [], error: null };
  if (error) throw error;
  const existingBySku = new Map(
    (existingRows ?? []).map((row) => [readText(row.normalized_sku) ?? normalizeSku(String(row.sku ?? "")), row])
  );
  let newCount = 0;
  let updateCount = 0;
  let unchangedCount = 0;
  const conflicts = parsed.rows.flatMap((row) => {
    const existing = existingBySku.get(normalizeSku(row.sku));
    if (!existing) {
      newCount += 1;
      return [];
    }
    const changed = productDimensionChanged(existing, row);
    if (changed) updateCount += 1;
    else unchangedCount += 1;
    return [{ sku: row.sku, existing, incoming: row, changed }];
  });
  return {
    fileName,
    rows: parsed.rows,
    conflicts,
    invalidRows: parsed.invalidRows,
    newCount,
    updateCount,
    unchangedCount
  };
}
async function importProductDimensions(adminClient, body, userId, userEmail) {
  const fileName = requiredText(body.fileName, "Indica el nombre del archivo importado.");
  const replaceExisting = body.replaceExisting === true;
  const rows = Array.isArray(body.rows) ? body.rows.map(normalizeProductDimensionImportRow).filter((row) => Boolean(row)) : [];
  if (!rows.length) throw new Error("No hay productos v\xE1lidos para importar.");
  const normalizedSkus = rows.map((row) => normalizeSku(row.sku));
  const { data: existingRows, error: existingError } = await adminClient.from("shipping_product_dimensions").select("*").in("normalized_sku", normalizedSkus);
  if (existingError) throw existingError;
  const existingBySku = new Map(
    (existingRows ?? []).map((row) => [readText(row.normalized_sku) ?? normalizeSku(String(row.sku ?? "")), row])
  );
  const changedExisting = rows.filter((row) => {
    const existing = existingBySku.get(normalizeSku(row.sku));
    return existing && productDimensionChanged(existing, row);
  });
  if (changedExisting.length && !replaceExisting) {
    throw new Error(`Hay ${changedExisting.length} SKU existentes con cambios. Confirma el reemplazo para actualizar la base.`);
  }
  const payload = rows.map((row) => ({
    sku: row.sku,
    product_name: row.product_name,
    unit_weight_kg: row.unit_weight_kg,
    volumetric_weight_kg: row.volumetric_weight_kg,
    billable_weight_kg: row.billable_weight_kg,
    width_cm: row.width_cm,
    length_cm: row.length_cm,
    height_cm: row.height_cm,
    source_file_name: fileName,
    source_row: row.source_row,
    uploaded_by: userId,
    updated_by: userId
  }));
  const { error } = await adminClient.from("shipping_product_dimensions").upsert(payload, { onConflict: "normalized_sku" });
  if (error) throw error;
  const inserted = rows.filter((row) => !existingBySku.has(normalizeSku(row.sku))).length;
  const updated = changedExisting.length;
  const unchanged = rows.length - inserted - updated;
  await audit(adminClient, {
    actorId: userId,
    actorEmail: userEmail,
    action: "shipping.product_dimensions.imported",
    entityType: "shipping_product_dimensions",
    entityId: fileName,
    previousValue: null,
    newValue: { fileName, inserted, updated, unchanged, total: rows.length }
  });
  return { inserted, updated, unchanged, total: rows.length };
}
async function saveProductDimension(adminClient, body, userId, userEmail) {
  const id = readText(body.id);
  const sku = requiredText(body.sku, "Indica el c\xF3digo del producto.");
  const lengthCm = requiredPositiveNumber(body.length_cm, "Indica un largo v\xE1lido.");
  const widthCm = requiredPositiveNumber(body.width_cm, "Indica un ancho v\xE1lido.");
  const heightCm = requiredPositiveNumber(body.height_cm, "Indica un alto v\xE1lido.");
  const unitWeightKg = body.unit_weight_kg == null || body.unit_weight_kg === "" ? null : nullableNonNegative(body.unit_weight_kg);
  if (body.unit_weight_kg != null && unitWeightKg === null) throw new ShippingError("Indica un peso f\xEDsico v\xE1lido.", { status: 400 });
  const protectionMargin = body.protection_margin_cm === void 0 ? void 0 : nullableNonNegative(body.protection_margin_cm);
  if (protectionMargin === null) throw new ShippingError("El margen de protecci\xF3n debe ser cero o mayor.", { status: 400 });
  const volumetricWeightKg = round3(Math.ceil(lengthCm) * Math.ceil(widthCm) * Math.ceil(heightCm) / 5e3, 3);
  const billableWeightKg = round3(Math.max(unitWeightKg ?? 0, volumetricWeightKg), 3);
  const payload = {
    sku,
    product_name: readText(body.product_name),
    length_cm: lengthCm,
    width_cm: widthCm,
    height_cm: heightCm,
    unit_weight_kg: unitWeightKg,
    volumetric_weight_kg: volumetricWeightKg,
    billable_weight_kg: billableWeightKg,
    updated_by: userId,
    ...body.can_rotate === void 0 ? {} : { can_rotate: body.can_rotate !== false },
    ...body.stackable === void 0 ? {} : { stackable: body.stackable !== false },
    ...body.fragile === void 0 ? {} : { fragile: body.fragile === true },
    ...body.requires_individual_package === void 0 ? {} : { requires_individual_package: body.requires_individual_package === true },
    ...body.can_combine === void 0 ? {} : { can_combine: body.can_combine !== false },
    ...body.packaging_group === void 0 ? {} : { packaging_group: readText(body.packaging_group) },
    ...protectionMargin === void 0 ? {} : { protection_margin_cm: protectionMargin },
    ...body.notes === void 0 ? {} : { notes: readText(body.notes) }
  };
  const { data: previous } = id ? await adminClient.from("shipping_product_dimensions").select("*").eq("id", id).maybeSingle() : { data: null };
  const query = id ? adminClient.from("shipping_product_dimensions").update(payload).eq("id", id) : adminClient.from("shipping_product_dimensions").insert({ ...payload, uploaded_by: userId });
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  await audit(adminClient, {
    actorId: userId,
    actorEmail: userEmail,
    action: "shipping.product_dimension.updated",
    entityType: "shipping_product_dimensions",
    entityId: data.id,
    previousValue: previous,
    newValue: data
  });
  return data;
}
async function createQuote(adminClient, body, userId, userEmail) {
  const settings = await requireConfiguredSettings(adminClient);
  let diagnosticStage = "DECRYPT_CREDENTIALS";
  let validatedPlan = null;
  let packages;
  if (isRecord(body.packingRequest)) {
    const request = body.packingRequest;
    if (request.version !== 1 || !Array.isArray(request.lines) || request.lines.length > 2e3 || request.lines.some((line) => !isRecord(line))) {
      throw new ShippingError("La informaci\xF3n del embalaje no es v\xE1lida.", { status: 400, code: "INVALID_PACKING" });
    }
    try {
      validatedPlan = validatePackingAssignments(request.lines, await getPackageTypes(adminClient, false), request.assignments, request.strategy);
      const drafts = mapPackingToShipment(validatedPlan, calculateFinalPaddingVolumetricWeight(settings) * 5e3);
      packages = preparePackages(drafts, "GROSS_PACKAGE").map((pkg, index) => {
        const packed2 = validatedPlan.packages[index];
        return { ...pkg, packageTypeId: packed2.packagingTypeId, contentWeight: packed2.productsWeight, tareWeight: packed2.packagingWeight };
      });
      body.selectedPackingPlan = { ...validatedPlan, lines: request.lines, assignments: request.assignments };
      console.info("[shipping-quote:packing]", { event: "FEDEX_PACKAGES_CREATED", packages: packages.length, units: validatedPlan.metrics.articleCount });
    } catch (error) {
      throw new ShippingError(error instanceof Error ? error.message : "Revisa los datos f\xEDsicos del env\xEDo.", { status: 400, code: "INVALID_PACKING" });
    }
  } else {
    packages = applyFinalPackagingAdjustments(preparePackages(body.packages, settings.weight_input_mode), settings);
  }
  const destination = normalizeAddress(body.destination, "destino");
  const origin = {
    countryCode: settings.origin_country_code || "MX",
    postalCode: settings.origin_postal_code ?? "",
    stateOrProvinceCode: settings.origin_state_code,
    city: settings.origin_city,
    neighborhood: null,
    street: null
  };
  if (!packages.length) throw new Error("Agrega al menos un paquete v\xE1lido.");
  const fedexConfig = await decryptFedexConfig(settings);
  const quoteNumber = await nextQuoteNumber(adminClient);
  const totals = summarizePreparedPackages(packages);
  try {
    diagnosticStage = "FEDEX_OAUTH";
    const token = await getFedexAccessToken(fedexConfig);
    diagnosticStage = "BUILD_RATE_PAYLOAD";
    const payload = buildFedexRatePayload({
      settings,
      fedexConfig,
      origin,
      destination,
      packages,
      requestedShipDate: null
    });
    console.info("[shipping-quote:diagnostic]", {
      stage: diagnosticStage,
      environment: settings.environment,
      endpoint: `${fedexConfig.baseUrl}${FEDEX_RATE_ENDPOINT_PATH}`,
      payload: sanitizeFedexPayload(payload)
    });
    diagnosticStage = "FEDEX_RATE_REQUEST";
    const response = await fetchFedexRates(fedexConfig, token, payload);
    diagnosticStage = "FEDEX_RATE_RESPONSE";
    const rates = applyFinalPackagingCost(normalizeFedExRateResponse(response), settings);
    diagnosticStage = "NORMALIZE_RATES";
    if (!rates.length) {
      const fallbackPayload = buildFedexListRateFallback(payload);
      const fallbackResponse = fallbackPayload ? await fetchFedexRates(fedexConfig, token, fallbackPayload) : null;
      const fallbackRates = fallbackResponse ? applyFinalPackagingCost(normalizeFedExRateResponse(fallbackResponse), settings) : [];
      if (fallbackRates.length) {
        const bestRate2 = fallbackRates.slice().sort((left, right) => left.totalAmount - right.totalAmount)[0];
        diagnosticStage = "SAVE_QUOTE";
        return insertQuote(adminClient, {
          quoteNumber,
          userId,
          userEmail,
          settings,
          origin,
          destination,
          requestedShipDate: null,
          packages,
          totals,
          status: "SUCCESS",
          errorMessage: null,
          technicalError: null,
          bestRate: bestRate2,
          rates: fallbackRates,
          odooOrderName: readText(body.odooOrderName),
          odooOrderId: nullableInteger(body.odooOrderId),
          selectedPackingPlan: isRecord(body.selectedPackingPlan) ? body.selectedPackingPlan : null
        });
      }
      throw new Error(`FedEx no devolvi\xF3 servicios disponibles. Respuesta: ${safeFedexText(JSON.stringify(response).slice(0, 1800))}`);
    }
    const bestRate = rates.slice().sort((left, right) => left.totalAmount - right.totalAmount)[0];
    diagnosticStage = "SAVE_QUOTE";
    const quote = await insertQuote(adminClient, {
      quoteNumber,
      userId,
      userEmail,
      settings,
      origin,
      destination,
      requestedShipDate: null,
      packages,
      totals,
      status: "SUCCESS",
      errorMessage: null,
      technicalError: null,
      bestRate,
      rates,
      odooOrderName: readText(body.odooOrderName),
      odooOrderId: nullableInteger(body.odooOrderId),
      selectedPackingPlan: isRecord(body.selectedPackingPlan) ? body.selectedPackingPlan : null
    });
    return quote;
  } catch (error) {
    const technicalError = sanitizeErrorText(error);
    const userMessage = mapFedexError(error);
    const normalizedError = normalizeShippingError(error, userMessage);
    normalizedError.diagnosticStage ??= diagnosticStage;
    normalizedError.environment = settings.environment;
    await insertQuote(adminClient, {
      quoteNumber,
      userId,
      userEmail,
      settings,
      origin,
      destination,
      requestedShipDate: null,
      packages,
      totals,
      status: "ERROR",
      errorMessage: userMessage,
      technicalError,
      diagnosticStage: normalizedError.diagnosticStage,
      providerStatus: normalizedError.providerStatus,
      providerCode: normalizedError.providerCode,
      providerMessage: normalizedError.providerMessage,
      providerTransactionId: normalizedError.providerTransactionId,
      providerEndpoint: normalizedError.providerEndpoint,
      retryable: normalizedError.retryable,
      bestRate: null,
      rates: [],
      odooOrderName: readText(body.odooOrderName),
      odooOrderId: nullableInteger(body.odooOrderId),
      selectedPackingPlan: isRecord(body.selectedPackingPlan) ? body.selectedPackingPlan : null
    });
    throw normalizedError;
  }
}
async function lookupOdooOrder(adminClient, body) {
  const orderNumber = requiredText(body.orderNumber, "Indica el n\xFAmero de cotizaci\xF3n u orden.");
  const odoo = readOdooEnvironment();
  assertOdooEnvironment(odoo);
  const connection = await authenticateWithDatabaseCandidates({
    apiKey: odoo.apiKey,
    configuredDatabase: odoo.database,
    odooUrl: odoo.url,
    user: odoo.user
  });
  const { database, odooUrl, uid } = connection;
  const partnerMeta = await fieldsGet({ apiKey: odoo.apiKey, database, model: "res.partner", odooUrl, uid });
  const partnerPostalFields = detectPartnerPostalFields(partnerMeta);
  const orderRows = await searchReadAll({
    apiKey: odoo.apiKey,
    database,
    domain: [["name", "=", orderNumber]],
    fields: [
      "id",
      "name",
      "date_order",
      "state",
      "partner_id",
      "partner_shipping_id",
      "order_line",
      "amount_total",
      "currency_id",
      "user_id",
      "company_id"
    ],
    model: "sale.order",
    odooUrl,
    order: "id desc",
    uid
  });
  const fallbackOrderRows = orderRows.length ? [] : await searchReadAll({
    apiKey: odoo.apiKey,
    database,
    domain: [["name", "=ilike", orderNumber]],
    fields: [
      "id",
      "name",
      "date_order",
      "state",
      "partner_id",
      "partner_shipping_id",
      "order_line",
      "amount_total",
      "currency_id",
      "user_id",
      "company_id"
    ],
    model: "sale.order",
    odooUrl,
    order: "id desc",
    uid
  });
  const [order] = orderRows.length ? orderRows : fallbackOrderRows;
  if (!order?.id) {
    throw new Error(`No se encontr\xF3 una cotizaci\xF3n u orden con el n\xFAmero ${orderNumber}.`);
  }
  const orderId = Number(order.id);
  const invoicePartnerId = many2oneId(order.partner_id);
  const shippingPartnerId = many2oneId(order.partner_shipping_id) ?? invoicePartnerId;
  if (!shippingPartnerId) throw new Error("La orden no tiene una direcci\xF3n de entrega asociada en Odoo.");
  const partnerIds = uniqueNumbers([shippingPartnerId, invoicePartnerId]);
  const [basePartnerRows, lineRows] = await Promise.all([
    searchReadAll({
      apiKey: odoo.apiKey,
      database,
      domain: [["id", "in", partnerIds]],
      fields: buildPartnerFields(partnerPostalFields),
      model: "res.partner",
      odooUrl,
      uid
    }),
    searchReadAll({
      apiKey: odoo.apiKey,
      database,
      domain: [["order_id", "=", orderId], ["display_type", "=", false]],
      fields: ["id", "product_id", "product_uom_qty", "product_uom", "name", "price_unit"],
      model: "sale.order.line",
      odooUrl,
      order: "id asc",
      uid
    })
  ]);
  if (!lineRows.length) throw new Error("La orden no contiene productos para enviar.");
  const basePartnersById = new Map(basePartnerRows.map((partner2) => [Number(partner2.id), partner2]));
  const directShippingPartner = shippingPartnerId ? basePartnersById.get(shippingPartnerId) ?? null : null;
  const directInvoicePartner = invoicePartnerId ? basePartnersById.get(invoicePartnerId) ?? null : null;
  const deliveryParentIds = uniqueNumbers([
    shippingPartnerId,
    invoicePartnerId,
    many2oneId(directShippingPartner?.parent_id),
    many2oneId(directInvoicePartner?.parent_id),
    many2oneId(directShippingPartner?.commercial_partner_id),
    many2oneId(directInvoicePartner?.commercial_partner_id)
  ]);
  const deliveryChildRows = deliveryParentIds.length ? await searchReadAll({
    apiKey: odoo.apiKey,
    database,
    domain: [["parent_id", "in", deliveryParentIds], ["type", "=", "delivery"]],
    fields: buildPartnerFields(partnerPostalFields),
    model: "res.partner",
    odooUrl,
    order: "id asc",
    uid
  }) : [];
  const partnerRows = uniquePartnerRows([...basePartnerRows, ...deliveryChildRows]);
  const productIds = uniqueNumbers(lineRows.map((line) => many2oneId(line.product_id)));
  const [productMeta, templateMeta] = await Promise.all([
    fieldsGet({ apiKey: odoo.apiKey, database, model: "product.product", odooUrl, uid }),
    fieldsGet({ apiKey: odoo.apiKey, database, model: "product.template", odooUrl, uid })
  ]);
  const productLogisticsFields = detectProductLogisticsFields(productMeta);
  const templateLogisticsFields = detectProductLogisticsFields(templateMeta);
  const productReferenceFields = detectProductReferenceFields(productMeta);
  const templateReferenceFields = detectProductReferenceFields(templateMeta);
  const productRows = productIds.length ? await searchReadAll({
    apiKey: odoo.apiKey,
    database,
    domain: [["id", "in", productIds]],
    fields: buildProductFields(productMeta, productLogisticsFields, productReferenceFields),
    model: "product.product",
    odooUrl,
    uid
  }) : [];
  const productMap = new Map(productRows.map((product) => [Number(product.id), product]));
  const templateIds = uniqueNumbers(productRows.map((product) => many2oneId(product.product_tmpl_id)));
  const templateRows = templateIds.length ? await searchReadAll({
    apiKey: odoo.apiKey,
    database,
    domain: [["id", "in", templateIds]],
    fields: buildTemplateFields(templateMeta, templateLogisticsFields, templateReferenceFields),
    model: "product.template",
    odooUrl,
    uid
  }) : [];
  const templateMap = new Map(templateRows.map((template) => [Number(template.id), template]));
  const { data: savedProfiles, error: profileError } = productIds.length ? await adminClient.from("shipping_product_profiles").select("odoo_product_id, sku, product_name, unit_weight_kg, length_cm, width_cm, height_cm, can_rotate, stackable, fragile, can_combine, packaging_group, shipping_mode").in("odoo_product_id", productIds) : { data: [], error: null };
  if (profileError) console.error("[shipping-quote:profiles]", sanitizeError(profileError));
  const profileMap = new Map(
    (savedProfiles ?? []).map((profile) => [Number(profile.odoo_product_id), profile])
  );
  const candidateSkus = uniqueTexts(productRows.flatMap((product) => {
    const templateId = many2oneId(product.product_tmpl_id);
    const template = templateId ? templateMap.get(templateId) ?? {} : {};
    return resolveProductReferenceCandidates(product, template, { product: productReferenceFields, template: templateReferenceFields }).map((value) => normalizeSku(value));
  }));
  const { data: savedDimensions, error: dimensionError } = candidateSkus.length ? await adminClient.from("shipping_product_dimensions").select("*").in("normalized_sku", candidateSkus) : { data: [], error: null };
  if (dimensionError) console.error("[shipping-quote:dimensions]", sanitizeError(dimensionError));
  const dimensionMap = new Map(
    (savedDimensions ?? []).map((dimension) => [readText(dimension.normalized_sku) ?? normalizeSku(String(dimension.sku ?? "")), dimension])
  );
  const countryIds = uniqueNumbers(partnerRows.map((partner2) => many2oneId(partner2.country_id)));
  const countryRows = countryIds.length ? await searchReadAll({
    apiKey: odoo.apiKey,
    database,
    domain: [["id", "in", countryIds]],
    fields: ["id", "code", "name"],
    model: "res.country",
    odooUrl,
    uid
  }) : [];
  const countryCodeById = new Map(countryRows.map((country) => [Number(country.id), readText(country.code) ?? readText(country.name)]));
  const shippingPartner = partnerRows.find((row) => Number(row.id) === shippingPartnerId) ?? partnerRows[0] ?? {};
  const invoicePartner = partnerRows.find((row) => Number(row.id) === invoicePartnerId) ?? {};
  const shippingChildDeliveryPartner = findMatchingDeliveryPartner(partnerRows, shippingPartner, partnerPostalFields);
  const invoiceChildDeliveryPartner = findMatchingDeliveryPartner(partnerRows, invoicePartner, partnerPostalFields);
  const shippingPostalCode = firstPostalCodeFromPartner(shippingPartner, partnerPostalFields);
  const shippingChildPostalCode = firstPostalCodeFromPartner(shippingChildDeliveryPartner ?? {}, partnerPostalFields);
  const invoiceChildPostalCode = firstPostalCodeFromPartner(invoiceChildDeliveryPartner ?? {}, partnerPostalFields);
  const invoicePostalCode = firstPostalCodeFromPartner(invoicePartner, partnerPostalFields);
  const usedShippingChildAddress = Boolean(shippingChildPostalCode);
  const usedInvoiceChildAddress = !shippingChildPostalCode && Boolean(invoiceChildPostalCode);
  const usedInvoicePostalFallback = !shippingChildPostalCode && !invoiceChildPostalCode && !shippingPostalCode && Boolean(invoicePostalCode);
  const partner = shippingChildPostalCode && shippingChildDeliveryPartner ? mergeMissingPartnerFields(shippingChildDeliveryPartner, shippingPartner) : invoiceChildPostalCode && invoiceChildDeliveryPartner ? mergeMissingPartnerFields(invoiceChildDeliveryPartner, invoicePartner) : shippingPostalCode ? shippingPartner : mergeMissingPartnerFields(shippingPartner, invoicePartner);
  const postalCode = firstPostalCodeFromPartner(partner, partnerPostalFields);
  const countryCode = resolveCountryCode(partner.country_id, countryCodeById) ?? "MX";
  const lines = lineRows.map((line) => {
    const productId = many2oneId(line.product_id) ?? 0;
    const product = productMap.get(productId) ?? {};
    const templateId = many2oneId(product.product_tmpl_id);
    const template = templateId ? templateMap.get(templateId) ?? {} : {};
    const profile = profileMap.get(productId) ?? {};
    const productName = many2oneLabel(line.product_id) ?? readText(product.name) ?? readText(template.name) ?? readText(line.name) ?? "Producto sin nombre";
    const skuCandidates = resolveProductReferenceCandidates(product, template, { product: productReferenceFields, template: templateReferenceFields });
    const matchedSku = skuCandidates.find((candidate) => dimensionMap.has(normalizeSku(candidate))) ?? null;
    const sku = matchedSku ?? readText(product.default_code) ?? readText(template.default_code) ?? readText(product.barcode) ?? readText(profile.sku);
    const dimension = matchedSku ? dimensionMap.get(normalizeSku(matchedSku)) ?? {} : {};
    const matchedDimension = Boolean(matchedSku);
    const productType = readText(product.detailed_type) ?? readText(product.type) ?? readText(template.detailed_type) ?? readText(template.type);
    const productCategory = many2oneLabel(product.categ_id) ?? many2oneLabel(template.categ_id);
    const volumeWeightKg = firstNumber(product.volume, template.volume);
    const isConsumable = isConsumableProduct(productType, productCategory);
    const saleOk = firstBoolean(product.sale_ok, template.sale_ok) === true;
    const exclusionReason = !isConsumable ? "No entra en env\xEDo: el tipo de producto no es Consumible." : !saleOk ? "No entra en env\xEDo: el producto no tiene marcada la opci\xF3n Se puede vender." : null;
    const isEligibleForShipping = !exclusionReason;
    const lengthCm = firstNumber(dimension.length_cm) ?? firstNumberFromFields(product, productLogisticsFields.length) ?? firstNumberFromFields(template, templateLogisticsFields.length) ?? firstNumber(profile.length_cm);
    const widthCm = firstNumber(dimension.width_cm) ?? firstNumberFromFields(product, productLogisticsFields.width) ?? firstNumberFromFields(template, templateLogisticsFields.width) ?? firstNumber(profile.width_cm);
    const heightCm = firstNumber(dimension.height_cm) ?? firstNumberFromFields(product, productLogisticsFields.height) ?? firstNumberFromFields(template, templateLogisticsFields.height) ?? firstNumber(profile.height_cm);
    const physicalWeightKg = dimension.unit_weight_kg != null ? Number(dimension.unit_weight_kg) : firstNumber(product.weight, template.weight, profile.unit_weight_kg);
    const configuredVolumetricWeightKg = firstNumber(dimension.volumetric_weight_kg);
    const resolvedVolumetricWeightKg = volumeWeightKg ?? configuredVolumetricWeightKg;
    const weightKg = physicalWeightKg;
    const logisticsSource = matchedDimension ? "Base de dimensiones por SKU" : physicalWeightKg ? "Peso f\xEDsico de Odoo" : null;
    const missingFields = [
      isEligibleForShipping && !lengthCm ? "largo" : null,
      isEligibleForShipping && !widthCm ? "ancho" : null,
      isEligibleForShipping && !heightCm ? "alto" : null,
      isEligibleForShipping && weightKg == null ? "peso f\xEDsico" : null
    ].filter((value) => Boolean(value));
    return {
      lineId: Number(line.id),
      productId,
      sku,
      productName,
      description: readText(line.name) ?? "",
      quantity: num(line.product_uom_qty),
      uom: many2oneLabel(line.product_uom),
      priceUnit: num(line.price_unit),
      lengthCm: lengthCm ?? null,
      widthCm: widthCm ?? null,
      heightCm: heightCm ?? null,
      weightKg: weightKg ?? null,
      volumeWeightKg: resolvedVolumetricWeightKg ?? null,
      productType: productType ?? null,
      productCategory: productCategory ?? null,
      saleOk,
      isEligibleForShipping,
      exclusionReason,
      logisticsSource,
      physicalProductId: readText(dimension.id),
      canRotate: dimension.can_rotate !== false,
      canStack: dimension.stackable !== false,
      shipAlone: dimension.requires_individual_package === true,
      canCombine: dimension.can_combine !== false,
      fragile: dimension.fragile === true,
      packingGroup: readText(dimension.packaging_group),
      protectionMarginCm: Number(dimension.protection_margin_cm) || 0,
      missingFields
    };
  });
  return {
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    order: {
      id: orderId,
      name: readText(order.name) ?? orderNumber,
      dateOrder: readText(order.date_order),
      state: readText(order.state) ?? "draft",
      amountTotal: num(order.amount_total),
      currencyCode: currencyLabel(order.currency_id),
      salesperson: many2oneLabel(order.user_id),
      company: many2oneLabel(order.company_id)
    },
    destination: {
      name: readText(partner.name),
      company: many2oneLabel(partner.parent_id),
      email: readText(partner.email),
      phone: readText(partner.phone),
      countryCode,
      postalCode: postalCode ?? "",
      stateOrProvinceCode: stateShortCode(partner.state_id) ?? many2oneLabel(partner.state_id),
      city: readText(partner.city),
      neighborhood: null,
      street: readText(partner.street)
    },
    lines,
    warnings: [
      usedShippingChildAddress ? "Se us\xF3 el c\xF3digo postal del contacto de Entrega asociado al contacto de la orden." : null,
      usedInvoiceChildAddress ? "La direcci\xF3n de entrega directa no ten\xEDa c\xF3digo postal; se us\xF3 un contacto de Entrega asociado al cliente." : null,
      usedInvoicePostalFallback ? "La direcci\xF3n de entrega no tiene c\xF3digo postal; se us\xF3 el c\xF3digo postal del contacto de la orden." : null,
      lines.some((line) => line.missingFields.length) ? "Hay productos con informaci\xF3n log\xEDstica incompleta. Completa esos datos antes de calcular embalaje." : null,
      lines.some((line) => !line.isEligibleForShipping) ? "Se omitieron productos que no son Consumible o no tienen marcada la opci\xF3n Se puede vender." : null
    ].filter((item) => Boolean(item))
  };
}
async function resolveHistoricalZone(adminClient, body) {
  const settings = await getCarrierSettings(adminClient);
  if (!settings?.origin_postal_code) {
    return { originPostalCode: settings?.origin_postal_code ?? null, destinationPostalCode: readText(body.destinationPostalCode), originGroup: null, destinationGroup: null, zone: null, available: false, message: "Configura el c\xF3digo postal de origen de FedEx." };
  }
  const destinationPostalCode = normalizeHistoricalPostalCode(body.destinationPostalCode);
  if (!destinationPostalCode) throw new ShippingError("Indica un c\xF3digo postal mexicano de 5 d\xEDgitos.", { status: 400, code: "INVALID_DESTINATION_POSTAL" });
  const result = await resolveZoneWithCatalog(adminClient, settings.origin_postal_code, destinationPostalCode);
  return {
    originPostalCode: normalizeHistoricalPostalCode(settings.origin_postal_code),
    destinationPostalCode,
    ...result,
    available: Boolean(result.zone),
    message: result.zone ? "Zona FedEx encontrada en el cat\xE1logo vigente." : "No existe una zona FedEx vigente para ese origen y destino. Carga el cat\xE1logo oficial para habilitar la estimaci\xF3n."
  };
}
async function estimateHistoricalRate(adminClient, body, userId, userEmail, access) {
  const settings = await getCarrierSettings(adminClient);
  if (!settings?.origin_postal_code) throw new ShippingError("Configura el c\xF3digo postal de origen de FedEx antes de estimar.", { status: 400, code: "MISSING_ORIGIN_POSTAL" });
  const destinationPostalCode = normalizeHistoricalPostalCode(body.destinationPostalCode);
  if (!destinationPostalCode) throw new ShippingError("Indica un c\xF3digo postal mexicano de 5 d\xEDgitos.", { status: 400, code: "INVALID_DESTINATION_POSTAL" });
  const rawPackages = Array.isArray(body.packages) ? body.packages : [];
  if (!rawPackages.length || rawPackages.length > 200) throw new ShippingError("Agrega entre 1 y 200 paquetes para estimar.", { status: 400, code: "INVALID_ESTIMATE_PACKAGES" });
  const packages = rawPackages.map((item, index) => {
    const value = isRecord(item) ? item : {};
    const lengthCm = positiveNumber(value.lengthCm ?? value.length, `largo del paquete ${index + 1}`);
    const widthCm = positiveNumber(value.widthCm ?? value.width, `ancho del paquete ${index + 1}`);
    const heightCm = positiveNumber(value.heightCm ?? value.height, `alto del paquete ${index + 1}`);
    const physicalWeightKg = nonNegativeNumber(value.physicalWeightKg ?? value.weightKg ?? value.actualWeight, `peso del paquete ${index + 1}`);
    return { lengthCm, widthCm, heightCm, physicalWeightKg };
  });
  const physicalWeight = sum(packages.map((item) => item.physicalWeightKg));
  const volumeCm3 = sum(packages.map((item) => item.lengthCm * item.widthCm * item.heightCm));
  const volumetricWeight = volumeCm3 / 5e3;
  const billableWeight = Math.max(physicalWeight, volumetricWeight);
  const zoneCatalog = await loadHistoricalZoneCatalog(adminClient);
  const targetZone = resolveZoneFromCatalog(zoneCatalog, settings.origin_postal_code, destinationPostalCode);
  const environment = settings.environment;
  const warningParts = [];
  if (environment === "SANDBOX") warningParts.push("La evidencia proviene de Sandbox y debe tratarse como referencia de pruebas.");
  if (!targetZone.zone) warningParts.push("No hay una zona FedEx oficial cargada para este origen y destino.");
  const quotesQuery = adminClient.from("shipping_quotes").select("id, environment, package_count, total_content_weight, total_billable_weight, destination, origin, best_total_amount, best_currency, best_service_code, best_service_name, created_at").eq("status", "SUCCESS").eq("environment", environment).not("best_total_amount", "is", null).not("best_currency", "is", null).order("created_at", { ascending: false }).limit(200);
  if (!access.viewAll) quotesQuery.eq("user_id", userId);
  const { data: quoteRows, error: quotesError } = await quotesQuery;
  if (quotesError) throw quotesError;
  const quoteIds = (quoteRows ?? []).map((row) => String(row.id));
  const { data: packageRows, error: packageError } = quoteIds.length ? await adminClient.from("shipping_quote_packages").select("quote_id, length, width, height").in("quote_id", quoteIds) : { data: [], error: null };
  if (packageError) throw packageError;
  const volumeByQuote = /* @__PURE__ */ new Map();
  for (const row of packageRows ?? []) {
    const volume2 = positiveNumber(row.length, "largo hist\xF3rico") * positiveNumber(row.width, "ancho hist\xF3rico") * positiveNumber(row.height, "alto hist\xF3rico");
    volumeByQuote.set(String(row.quote_id), (volumeByQuote.get(String(row.quote_id)) ?? 0) + volume2);
  }
  const candidates = [];
  for (const row of quoteRows ?? []) {
    const destination = isRecord(row.destination) ? row.destination : {};
    const origin = isRecord(row.origin) ? row.origin : {};
    const originPostal = normalizeHistoricalPostalCode(origin.postalCode);
    const historicalPostal = normalizeHistoricalPostalCode(destination.postalCode);
    const historicalZone = originPostal && historicalPostal ? resolveZoneFromCatalog(zoneCatalog, originPostal, historicalPostal) : { zone: null };
    const amount = Number(row.best_total_amount);
    const currency2 = readText(row.best_currency)?.toUpperCase() ?? "";
    const volume2 = volumeByQuote.get(String(row.id));
    if (!historicalZone.zone || !targetZone.zone || historicalZone.zone !== targetZone.zone || !Number.isFinite(amount) || !currency2 || !volume2) continue;
    candidates.push({
      id: String(row.id),
      amount,
      currency: currency2,
      environment: row.environment === "PRODUCTION" ? "PRODUCTION" : "SANDBOX",
      serviceCode: readText(row.best_service_code),
      serviceName: readText(row.best_service_name),
      packageCount: Math.max(1, Number(row.package_count) || 1),
      physicalWeight: Math.max(0, Number(row.total_content_weight) || 0),
      volumetricWeight: volume2 / 5e3,
      billableWeight: Math.max(0, Number(row.total_billable_weight) || volume2 / 5e3),
      volumeCm3: volume2,
      fedexZone: historicalZone.zone,
      createdAt: String(row.created_at)
    });
  }
  const currency = readText(body.currency)?.toUpperCase() || settings.preferred_currency || "MXN";
  const estimation = targetZone.zone ? estimateFedexHistory({ fedexZone: targetZone.zone, serviceCode: readText(body.serviceCode), packageCount: packages.length, physicalWeight, volumetricWeight, billableWeight, volumeCm3, environment, currency }, candidates) : { estimatedAmount: null, estimatedLow: null, estimatedHigh: null, medianAmount: null, averageAmount: null, minimumAmount: null, maximumAmount: null, p25Amount: null, p75Amount: null, confidence: "INSUFICIENTE", confidenceScore: 0, comparables: [], outlierQuoteIds: [] };
  if (!estimation.comparables.length) warningParts.push(`No hay suficientes cotizaciones hist\xF3ricas comparables en ${environment === "SANDBOX" ? "Sandbox" : "Producci\xF3n"} y la misma moneda.`);
  const warning = warningParts.join(" ");
  const { data: saved, error: saveError } = await adminClient.from("shipping_rate_estimates").insert({
    user_id: userId,
    origin_postal_code: normalizeHistoricalPostalCode(settings.origin_postal_code),
    origin_group: targetZone.originGroup ?? null,
    destination_postal_code: destinationPostalCode,
    destination_group: targetZone.destinationGroup ?? null,
    fedex_zone: targetZone.zone ?? null,
    package_count: packages.length,
    physical_weight: physicalWeight,
    volumetric_weight: volumetricWeight,
    billable_weight: billableWeight,
    estimated_amount: estimation.estimatedAmount,
    currency: estimation.estimatedAmount == null ? null : currency,
    estimated_low: estimation.estimatedLow,
    estimated_high: estimation.estimatedHigh,
    median_amount: estimation.medianAmount,
    average_amount: estimation.averageAmount,
    minimum_amount: estimation.minimumAmount,
    maximum_amount: estimation.maximumAmount,
    p25_amount: estimation.p25Amount,
    p75_amount: estimation.p75Amount,
    confidence: estimation.confidence,
    confidence_score: estimation.confidenceScore,
    comparable_count: estimation.comparables.length,
    comparable_quote_ids: estimation.comparables.map((candidate) => candidate.id),
    environment_source: targetZone.zone ? environment : "NONE",
    algorithm_version: "HISTORICAL_ZONE_V1",
    odoo_order_id: nullableInteger(body.odooOrderId),
    odoo_order_name: readText(body.odooOrderName),
    service_code: readText(body.serviceCode),
    service_name: readText(body.serviceName),
    outlier_quote_ids: estimation.outlierQuoteIds,
    warning: warning || null
  }).select("id, created_at").single();
  if (saveError) throw saveError;
  return {
    estimateId: saved?.id ?? null,
    originPostalCode: normalizeHistoricalPostalCode(settings.origin_postal_code),
    destinationPostalCode,
    originGroup: targetZone.originGroup,
    destinationGroup: targetZone.destinationGroup,
    fedexZone: targetZone.zone,
    packageCount: packages.length,
    physicalWeight,
    volumetricWeight,
    billableWeight,
    environmentSource: targetZone.zone ? environment : "NONE",
    currency: estimation.estimatedAmount == null ? null : currency,
    warning: warning || null,
    ...estimation
  };
}
async function getHistoricalEstimateDetail(adminClient, body, userId, access) {
  const id = requiredText(body.id, "Selecciona una estimaci\xF3n.");
  let query = adminClient.from("shipping_rate_estimates").select("*").eq("id", id);
  if (!access.viewAll) query = query.eq("user_id", userId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}
async function loadHistoricalZoneCatalog(adminClient) {
  const [{ data: ranges, error: rangeError }, { data: matrix, error: matrixError }] = await Promise.all([
    adminClient.from("fedex_postal_ranges").select("country_code, postal_code_from, postal_code_to, postal_group, effective_from, effective_to, is_active").eq("country_code", "MX").eq("is_active", true).limit(5e3),
    adminClient.from("fedex_zone_matrix").select("origin_group, destination_group, zone, effective_from, effective_to, is_active").eq("is_active", true).limit(5e3)
  ]);
  if (rangeError) throw rangeError;
  if (matrixError) throw matrixError;
  return { ranges: ranges ?? [], matrix: matrix ?? [] };
}
async function resolveZoneWithCatalog(adminClient, originPostal, destinationPostal) {
  return resolveZoneFromCatalog(await loadHistoricalZoneCatalog(adminClient), originPostal, destinationPostal);
}
function resolveZoneFromCatalog(catalog, originPostal, destinationPostal) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const groupFor = (postal) => catalog.ranges.find((range) => postal >= String(range.postal_code_from) && postal <= String(range.postal_code_to) && isEffectiveRange(range.effective_from, range.effective_to, today))?.postal_group ?? null;
  const originGroup = groupFor(normalizeHistoricalPostalCode(originPostal));
  const destinationGroup = groupFor(normalizeHistoricalPostalCode(destinationPostal));
  const zone = catalog.matrix.find((item) => item.origin_group === originGroup && item.destination_group === destinationGroup && isEffectiveRange(item.effective_from, item.effective_to, today))?.zone ?? null;
  return { originGroup, destinationGroup, zone };
}
function isEffectiveRange(from, to, today) {
  return (!from || String(from) <= today) && (!to || String(to) >= today);
}
function normalizeHistoricalPostalCode(value) {
  const postal = String(value ?? "").replace(/\D/g, "").slice(0, 5);
  return postal.length === 5 ? postal : "";
}
function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new ShippingError(`Indica un ${label} v\xE1lido.`, { status: 400, code: "INVALID_ESTIMATE_PACKAGE" });
  return number;
}
function nonNegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new ShippingError(`Indica un ${label} v\xE1lido.`, { status: 400, code: "INVALID_ESTIMATE_PACKAGE" });
  return number;
}
function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
async function insertQuote(adminClient, input) {
  const { data: quote, error: quoteError } = await adminClient.from("shipping_quotes").insert({
    quote_number: input.quoteNumber,
    user_id: input.userId,
    user_email: input.userEmail,
    carrier: "FEDEX",
    environment: input.settings.environment,
    status: input.status,
    calculation_method: "MULTI_PACKAGE_RATE",
    origin: input.origin,
    destination: input.destination,
    requested_ship_date: input.requestedShipDate,
    package_count: input.packages.length,
    total_content_weight: input.totals.contentWeight,
    total_billable_weight: input.totals.billableWeight,
    weight_unit: "KG",
    best_total_amount: input.bestRate?.totalAmount ?? null,
    best_currency: input.bestRate?.currency ?? null,
    best_service_code: input.bestRate?.serviceCode ?? null,
    best_service_name: input.bestRate?.serviceName ?? null,
    best_delivery_label: input.bestRate?.deliveryLabel ?? null,
    error_message: input.errorMessage,
    technical_error: input.technicalError,
    diagnostic_stage: input.diagnosticStage ?? null,
    provider_status: input.providerStatus ?? null,
    provider_code: input.providerCode ?? null,
    provider_message: input.providerMessage ?? null,
    provider_transaction_id: input.providerTransactionId ?? null,
    provider_endpoint: input.providerEndpoint ?? null,
    retryable: input.retryable ?? false,
    odoo_order_name: input.odooOrderName ?? null,
    odoo_order_id: input.odooOrderId ?? null,
    selected_packing_plan: input.selectedPackingPlan ?? null,
    packing_source: input.selectedPackingPlan ? "ODOO_PACKING_ENGINE" : "MANUAL"
  }).select("*").single();
  if (quoteError) throw quoteError;
  const quoteId = String(quote.id);
  const [packagesResult, ratesResult] = await Promise.all([
    adminClient.from("shipping_quote_packages").insert(
      input.packages.map((item) => ({
        quote_id: quoteId,
        package_type_id: item.packageTypeId,
        package_snapshot: packageSnapshot(item.packageType),
        package_index: item.packageIndex,
        content_weight: item.contentWeight,
        tare_weight: item.tareWeight,
        billable_weight: item.billableWeight,
        weight_unit: item.packageType.weight_unit,
        length: item.packageType.external_length ?? item.packageType.length,
        width: item.packageType.external_width ?? item.packageType.width,
        height: item.packageType.external_height ?? item.packageType.height,
        dimension_unit: item.packageType.dimension_unit
      }))
    ).select("*"),
    input.rates.length ? adminClient.from("shipping_quote_rates").insert(
      input.rates.map((rate) => ({
        quote_id: quoteId,
        carrier: rate.carrier,
        service_code: rate.serviceCode,
        service_name: rate.serviceName,
        currency: rate.currency,
        base_amount: rate.baseAmount,
        discount_amount: rate.discountAmount,
        surcharge_amount: rate.surchargeAmount,
        tax_amount: rate.taxAmount,
        total_amount: rate.totalAmount,
        transit_days: rate.transitDays,
        estimated_delivery_date: rate.estimatedDeliveryDate,
        delivery_timestamp: rate.deliveryTimestamp,
        delivery_label: rate.deliveryLabel,
        rate_type: rate.rateType,
        raw_summary: rate.rawSummary
      }))
    ).select("*") : Promise.resolve({ data: [], error: null })
  ]);
  if (packagesResult.error) throw packagesResult.error;
  if (ratesResult.error) throw ratesResult.error;
  const rates = ratesResult.data ?? [];
  const bestRateRow = rates.slice().sort((left, right) => Number(left.total_amount) - Number(right.total_amount))[0];
  if (bestRateRow) {
    await adminClient.from("shipping_quotes").update({ best_rate_id: bestRateRow.id }).eq("id", quoteId);
  }
  return {
    ...quote,
    best_rate_id: bestRateRow?.id ?? null,
    packages: packagesResult.data ?? [],
    rates: ratesResult.data ?? []
  };
}
async function listQuotes(adminClient, body, userId, access) {
  const pageSize = clamp(Number(body.pageSize) || 20, 5, 50);
  const page = Math.max(1, Number(body.page) || 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const requestedAll = body.scope === "all";
  let query = adminClient.from("shipping_quotes").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (!access.viewAll || !requestedAll) query = query.eq("user_id", userId);
  if (body.status === "SUCCESS" || body.status === "ERROR") query = query.eq("status", body.status);
  const search = readText(body.search);
  if (search) query = query.or(`quote_number.ilike.%${escapeLike(search)}%,user_email.ilike.%${escapeLike(search)}%,best_service_name.ilike.%${escapeLike(search)}%`);
  if (readText(body.dateFrom)) query = query.gte("created_at", `${readText(body.dateFrom)}T00:00:00`);
  if (readText(body.dateTo)) query = query.lte("created_at", `${readText(body.dateTo)}T23:59:59`);
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}
async function getQuoteDetail(adminClient, id, userId, access) {
  if (!id) return null;
  let query = adminClient.from("shipping_quotes").select("*").eq("id", id);
  if (!access.viewAll) query = query.eq("user_id", userId);
  const { data: quote, error } = await query.maybeSingle();
  if (error) throw error;
  if (!quote) return null;
  const [packagesResult, ratesResult] = await Promise.all([
    adminClient.from("shipping_quote_packages").select("*").eq("quote_id", id).order("package_index", { ascending: true }),
    adminClient.from("shipping_quote_rates").select("*").eq("quote_id", id).order("total_amount", { ascending: true })
  ]);
  if (packagesResult.error) throw packagesResult.error;
  if (ratesResult.error) throw ratesResult.error;
  return {
    ...quote,
    packages: packagesResult.data ?? [],
    rates: ratesResult.data ?? []
  };
}
async function nextQuoteNumber(adminClient) {
  const { data, error } = await adminClient.rpc("next_shipping_quote_number");
  if (error) throw error;
  return String(data);
}
function publicConfig(settings) {
  return {
    id: settings.id,
    carrier: settings.carrier,
    environment: settings.environment,
    is_active: settings.is_active,
    fedex_base_url: settings.fedex_base_url,
    account_number_masked: settings.account_number_masked,
    client_id_masked: settings.client_id_masked,
    client_secret_configured: Boolean(settings.client_secret_encrypted),
    origin_country_code: settings.origin_country_code,
    origin_postal_code: settings.origin_postal_code,
    origin_state_code: settings.origin_state_code,
    origin_city: settings.origin_city,
    origin_street: settings.origin_street,
    preferred_currency: settings.preferred_currency,
    pickup_type: settings.pickup_type,
    return_transit_times: settings.return_transit_times,
    rate_request_types: Array.isArray(settings.rate_request_types) ? settings.rate_request_types : ["ACCOUNT"],
    rate_display_option: settings.rate_display_option,
    weight_input_mode: settings.weight_input_mode,
    final_volume_padding_enabled: settings.final_volume_padding_enabled !== false,
    final_padding_length_cm: Number(settings.final_padding_length_cm ?? 0),
    final_padding_width_cm: Number(settings.final_padding_width_cm ?? 0),
    final_padding_height_cm: Number(settings.final_padding_height_cm ?? 0),
    final_packaging_cost_enabled: settings.final_packaging_cost_enabled !== false,
    final_packaging_material_cost: Number(settings.final_packaging_material_cost ?? 0),
    created_at: settings.created_at,
    updated_at: settings.updated_at
  };
}
async function decryptFedexConfig(settings) {
  const accountNumber = normalizeFedexAccountNumber(await decryptSecret(settings.account_number_encrypted));
  const clientId = await decryptSecret(settings.client_id_encrypted);
  const clientSecret = await decryptSecret(settings.client_secret_encrypted);
  if (!accountNumber || !clientId || !clientSecret) {
    throw new Error("Faltan Account Number, Client ID o Client Secret de FedEx.");
  }
  return {
    baseUrl: trimSlash2(settings.fedex_base_url),
    accountNumber,
    clientId,
    clientSecret,
    environment: settings.environment
  };
}
async function getFedexAccessToken(config) {
  const cacheKey = buildFedexTokenCacheKey(config);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 6e4) return cached.token;
  const pending = tokenPromiseCache.get(cacheKey);
  if (pending) return pending;
  const tokenPromise = (async () => {
    const payload = await requestFedexOAuthToken(config, "client_credentials");
    if (!payload.ok) {
      throw new Error(
        `FedEx rechaz\xF3 la autenticaci\xF3n OAuth en ${config.baseUrl}. Verifica que Client ID, Client Secret y Account Number pertenezcan al ambiente configurado. Detalle: ${payload.status}${payload.errorText ? ` - ${payload.errorText}` : ""}`
      );
    }
    const token = readText(payload.body.access_token);
    if (!token) throw new Error("FedEx no devolvi\xF3 un token OAuth v\xE1lido.");
    const expiresIn = Number(payload.body.expires_in);
    const maxTokenTtlMs = 50 * 60 * 1e3;
    const safetyWindowMs = 2 * 60 * 1e3;
    const reportedTokenTtlMs = Number.isFinite(expiresIn) ? Math.max(0, expiresIn * 1e3) : maxTokenTtlMs;
    const usableTokenTtlMs = Math.max(3e4, Math.min(reportedTokenTtlMs, maxTokenTtlMs) - safetyWindowMs);
    tokenCache.set(cacheKey, {
      token,
      expiresAt: Date.now() + usableTokenTtlMs
    });
    return token;
  })();
  tokenPromiseCache.set(cacheKey, tokenPromise);
  try {
    return await tokenPromise;
  } finally {
    if (tokenPromiseCache.get(cacheKey) === tokenPromise) tokenPromiseCache.delete(cacheKey);
  }
}
function buildFedexTokenCacheKey(config) {
  return [
    "FEDEX",
    config.baseUrl,
    config.clientId ?? "",
    config.clientSecret ? maskSecret(config.clientSecret) : ""
  ].join(":");
}
async function requestFedexOAuthToken(config, grantType) {
  const params = new URLSearchParams();
  params.set("grant_type", grantType);
  params.set("client_id", config.clientId);
  params.set("client_secret", config.clientSecret);
  const endpoint = `${config.baseUrl}/oauth/token`;
  for (let attempt = 0; attempt < FEDEX_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await delay(retryDelayMs(attempt));
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(FEDEX_HTTP_TIMEOUT_MS)
      });
      const text = await response.text();
      const parsed = parseJsonObject(text);
      if (response.ok) {
        if (!parsed) {
          throw new ShippingError("FedEx devolvi\xF3 una respuesta OAuth inv\xE1lida.", {
            status: 502,
            code: "FEDEX_OAUTH_INVALID_RESPONSE",
            diagnosticStage: "FEDEX_OAUTH",
            providerStatus: response.status,
            providerEndpoint: endpoint
          });
        }
        return { ok: true, body: parsed };
      }
      if (!isTransientFedexStatus(response.status) || attempt === FEDEX_MAX_ATTEMPTS - 1) {
        return { ok: false, status: response.status, errorText: safeFedexText(text) };
      }
      const providerError = parseFedexErrorDetails(text);
      console.warn("[shipping-quote:diagnostic]", {
        stage: "FEDEX_OAUTH",
        environment: config.environment,
        endpoint,
        attempt: attempt + 1,
        nextAttempt: attempt + 2,
        providerStatus: response.status,
        providerCode: providerError.code,
        transactionId: providerError.transactionId
      });
    } catch (error) {
      if (attempt === FEDEX_MAX_ATTEMPTS - 1) {
        if (error instanceof ShippingError) throw error;
        throw new ShippingError(
          `FedEx no respondi\xF3 al renovar el token OAuth: ${error instanceof Error ? error.message : "error de red"}`,
          {
            status: 503,
            code: "FEDEX_OAUTH_NETWORK_ERROR",
            retryable: true,
            diagnosticStage: "FEDEX_OAUTH",
            providerEndpoint: endpoint
          }
        );
      }
    }
  }
  throw new Error("FedEx no respondi\xF3 al renovar el token OAuth.");
}
function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
async function fetchFedexRates(config, token, body) {
  let activeToken = token;
  let firstAttempt = await postFedexRateRequest(config, activeToken, body);
  if (isFedexAuthStatus(firstAttempt.response.status) && config.clientId && config.clientSecret) {
    tokenCache.delete(buildFedexTokenCacheKey(config));
    activeToken = await getFedexAccessToken({
      baseUrl: config.baseUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      environment: config.environment
    });
    firstAttempt = await postFedexRateRequest(config, activeToken, body);
  }
  if (firstAttempt.response.ok) {
    const parsed = parseJsonObject(firstAttempt.text);
    if (!parsed) {
      throw new ShippingError("FedEx devolvi\xF3 una respuesta de tarifas inv\xE1lida.", {
        status: 502,
        code: "FEDEX_INVALID_RATE_RESPONSE",
        retryable: false,
        diagnosticStage: "FEDEX_RATE_RESPONSE",
        environment: config.environment,
        providerStatus: firstAttempt.response.status,
        providerEndpoint: `${config.baseUrl}${FEDEX_RATE_ENDPOINT_PATH}`
      });
    }
    return parsed;
  }
  if (firstAttempt.response.status === 400 && firstAttempt.text.includes("SERVICE.PACKAGECOMBINATION.INVALID")) {
    const fallbackBody = buildFedexPackageCombinationFallback(body);
    if (fallbackBody) {
      const secondAttempt = await postFedexRateRequest(config, activeToken, fallbackBody);
      if (secondAttempt.response.ok) {
        const parsed = parseJsonObject(secondAttempt.text);
        if (!parsed) {
          throw new ShippingError("FedEx devolvi\xF3 una respuesta de tarifas inv\xE1lida.", {
            status: 502,
            code: "FEDEX_INVALID_RATE_RESPONSE",
            retryable: false,
            diagnosticStage: "FEDEX_RATE_RESPONSE",
            environment: config.environment,
            providerStatus: secondAttempt.response.status,
            providerEndpoint: `${config.baseUrl}${FEDEX_RATE_ENDPOINT_PATH}`
          });
        }
        return parsed;
      }
      console.warn("[shipping-quote:diagnostic]", {
        stage: "FEDEX_RATE_REQUEST",
        environment: config.environment ?? null,
        endpoint: `${config.baseUrl}${FEDEX_RATE_ENDPOINT_PATH}`,
        fallback: "PACKAGECOMBINATION",
        firstResponse: safeFedexText(firstAttempt.text)
      });
      throw fedexRateError(secondAttempt, config.baseUrl, config.environment);
    }
  }
  throw fedexRateError(firstAttempt, config.baseUrl, config.environment);
}
async function postFedexRateRequest(config, token, body, maxAttempts = FEDEX_MAX_ATTEMPTS) {
  const endpoint = `${config.baseUrl}${FEDEX_RATE_ENDPOINT_PATH}`;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await delay(retryDelayMs(attempt));
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-locale": "es_MX"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(FEDEX_HTTP_TIMEOUT_MS)
      });
      const text = await response.text();
      if (response.ok || !isTransientFedexStatus(response.status) || attempt === maxAttempts - 1) {
        return { response, text };
      }
      const providerError = parseFedexErrorDetails(text);
      console.warn("[shipping-quote:diagnostic]", {
        stage: "FEDEX_RATE_REQUEST",
        environment: config.environment,
        endpoint,
        attempt: attempt + 1,
        nextAttempt: attempt + 2,
        providerStatus: response.status,
        providerCode: providerError.code,
        transactionId: providerError.transactionId
      });
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        throw new ShippingError(
          `FedEx no respondi\xF3 a la solicitud de tarifas: ${error instanceof Error ? error.message : "error de red"}`,
          {
            status: 503,
            code: "FEDEX_RATE_NETWORK_ERROR",
            retryable: true,
            diagnosticStage: "FEDEX_RATE_REQUEST",
            providerEndpoint: endpoint
          }
        );
      }
    }
  }
  throw new Error("No fue posible completar la consulta de tarifas de FedEx.");
}
function isTransientFedexStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}
function isFedexAuthStatus(status) {
  return status === 401 || status === 403;
}
function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
function retryDelayMs(attempt) {
  if (attempt <= 0) return 0;
  const base = Math.min(8e3, 1e3 * 2 ** (attempt - 1));
  return base + Math.floor(Math.random() * 250);
}
function fedexRateError(attempt, baseUrl, environment) {
  const provider = parseFedexErrorDetails(attempt.text);
  const endpoint = `${baseUrl}${FEDEX_RATE_ENDPOINT_PATH}`;
  const providerStatus = attempt.response.status;
  const retryable = isTransientFedexStatus(providerStatus);
  const status = providerStatus === 429 ? 429 : retryable ? 503 : providerStatus === 400 ? 422 : 502;
  const message = provider.message ?? `HTTP ${providerStatus}`;
  console.error("[shipping-quote:diagnostic]", {
    stage: "FEDEX_RATE_RESPONSE",
    environment: environment ?? null,
    providerStatus,
    providerCode: provider.code,
    providerMessage: provider.message,
    transactionId: provider.transactionId,
    endpoint,
    retryable,
    response: safeFedexText(attempt.text)
  });
  return new ShippingError(`FedEx rechaz\xF3 la cotizaci\xF3n: ${message}`, {
    status,
    code: provider.code ?? (retryable ? "FEDEX_TEMPORARY_ERROR" : "FEDEX_REQUEST_REJECTED"),
    retryable,
    providerStatus,
    diagnosticStage: "FEDEX_RATE_RESPONSE",
    environment,
    providerCode: provider.code,
    providerMessage: provider.message,
    providerTransactionId: provider.transactionId,
    providerEndpoint: endpoint
  });
}
function buildFedexPackageCombinationFallback(body) {
  const cloned = parseJsonObject(JSON.stringify(body));
  if (!cloned) return null;
  const requestedShipment = isRecord(cloned.requestedShipment) ? cloned.requestedShipment : null;
  if (!requestedShipment) return null;
  requestedShipment.packagingType = "YOUR_PACKAGING";
  requestedShipment.rateRequestType = ["ACCOUNT", "LIST"];
  delete requestedShipment.rateDisplayOption;
  delete requestedShipment.serviceType;
  delete requestedShipment.specialServicesRequested;
  return cloned;
}
function buildFedexListRateFallback(body) {
  const cloned = parseJsonObject(JSON.stringify(body));
  if (!cloned) return null;
  const requestedShipment = isRecord(cloned.requestedShipment) ? cloned.requestedShipment : null;
  if (!requestedShipment) return null;
  requestedShipment.packagingType = "YOUR_PACKAGING";
  requestedShipment.rateRequestType = ["ACCOUNT", "LIST"];
  requestedShipment.rateDisplayOption = "SELECTED_RATES_EXCLUDING_F1R";
  delete requestedShipment.serviceType;
  delete requestedShipment.shipDateStamp;
  return cloned;
}
function buildFedexRatePayload({
  settings,
  fedexConfig,
  origin,
  destination,
  packages,
  requestedShipDate
}) {
  return {
    accountNumber: { value: fedexConfig.accountNumber },
    rateRequestControlParameters: {
      returnTransitTimes: settings.return_transit_times,
      servicesNeededOnRateFailure: true,
      rateSortOrder: "SERVICENAMETRADITIONAL"
    },
    requestedShipment: {
      shipper: { address: fedexAddress(origin, false) },
      recipient: { address: fedexAddress(destination, false) },
      // La pantalla no solicita fecha: FedEx recibe la fecha local actual para
      // calcular la disponibilidad y el tránsito sin añadir un campo manual.
      shipDateStamp: requestedShipDate || mexicoBusinessDate(),
      pickupType: settings.pickup_type,
      packagingType: "YOUR_PACKAGING",
      rateRequestType: resolveRateRequestTypes(settings.rate_request_types),
      rateDisplayOption: readEnum(
        settings.rate_display_option,
        ["LOWER_RATE", "SELECTED_RATES_INCLUDING_F1R", "SELECTED_RATES_EXCLUDING_F1R"],
        "SELECTED_RATES_EXCLUDING_F1R"
      ),
      totalPackageCount: packages.length,
      requestedPackageLineItems: packages.map((item, index) => ({
        sequenceNumber: index + 1,
        groupPackageCount: 1,
        weight: {
          units: item.packageType.weight_unit.toUpperCase(),
          value: round3(Math.max(item.actualWeight, item.billableWeight), 2)
        },
        dimensions: {
          length: Math.max(1, Math.ceil(item.packageType.external_length ?? item.packageType.length ?? 0)),
          width: Math.max(1, Math.ceil(item.packageType.external_width ?? item.packageType.width ?? 0)),
          height: Math.max(1, Math.ceil(item.packageType.external_height ?? item.packageType.height ?? 0)),
          units: item.packageType.dimension_unit.toUpperCase()
        }
      }))
    }
  };
}
function buildFedexConnectionProbe(accountNumber, origin, pickupType) {
  const address = fedexAddress(origin, false);
  return {
    accountNumber: { value: accountNumber },
    requestedShipment: {
      shipper: { address },
      recipient: { address },
      pickupType,
      packagingType: "YOUR_PACKAGING",
      rateRequestType: ["ACCOUNT", "LIST"],
      requestedPackageLineItems: [
        {
          weight: { units: "KG", value: 1 },
          dimensions: { length: 10, width: 10, height: 10, units: "CM" }
        }
      ]
    }
  };
}
function resolveRateRequestTypes(value) {
  const configured = Array.isArray(value) ? value.map((item) => readText(item)).filter(Boolean) : [];
  return [.../* @__PURE__ */ new Set(["ACCOUNT", "LIST", ...configured])];
}
function normalizeFedExRateResponse(payload) {
  const output = isRecord(payload.output) ? payload.output : {};
  const details = Array.isArray(output.rateReplyDetails) ? output.rateReplyDetails : Array.isArray(payload.rateReplyDetails) ? payload.rateReplyDetails : [];
  return details.map((row) => {
    if (!isRecord(row)) return null;
    const serviceCode = readText(row.serviceType) ?? "UNKNOWN";
    const serviceName = readText(row.serviceName) ?? serviceCode;
    const shipmentDetails = Array.isArray(row.ratedShipmentDetails) ? row.ratedShipmentDetails : [];
    const accountRate = shipmentDetails.find(
      (detail) => isRecord(detail) && readText(detail.rateType)?.includes("ACCOUNT")
    ) ?? shipmentDetails[0] ?? null;
    if (!isRecord(accountRate)) return null;
    const rateDetail = isRecord(accountRate.shipmentRateDetail) ? accountRate.shipmentRateDetail : {};
    const totalNet = money(rateDetail.totalNetCharge) ?? money(rateDetail.totalNetFedExCharge) ?? money(accountRate.totalNetCharge) ?? money(accountRate.totalNetFedExCharge) ?? money(row.totalNetCharge) ?? money(rateDetail.totalBaseCharge);
    if (!totalNet || totalNet.amount < 0) return null;
    const base = money(rateDetail.totalBaseCharge);
    const currency = totalNet.currency ?? base?.currency ?? readText(rateDetail.currency) ?? "USD";
    const commit = isRecord(row.commit) ? row.commit : {};
    const dateDetail = isRecord(commit.dateDetail) ? commit.dateDetail : {};
    const deliveryTimestamp = readText(commit.commitTimestamp) ?? readText(dateDetail.dayFormat) ?? null;
    const estimatedDeliveryDate = readText(dateDetail.date) ?? readText(commit.date) ?? null;
    const transitDays = firstNumber(commit.transitDays, commit.estimatedTransitDays);
    const deliveryLabel = estimatedDeliveryDate ?? (transitDays !== null ? `${Math.round(transitDays)} d\xEDas` : "Tiempo de entrega no disponible");
    return {
      carrier: "FEDEX",
      serviceCode,
      serviceName,
      currency,
      baseAmount: base?.amount ?? null,
      discountAmount: sumMoneyArray(rateDetail.discounts),
      surchargeAmount: sumMoneyArray(rateDetail.surcharges),
      taxAmount: sumMoneyArray(rateDetail.taxes),
      totalAmount: totalNet.amount,
      transitDays: transitDays === null ? null : Math.round(transitDays),
      estimatedDeliveryDate,
      deliveryTimestamp,
      deliveryLabel,
      rateType: readText(accountRate.rateType),
      rawSummary: {
        serviceType: row.serviceType,
        serviceName: row.serviceName,
        rateType: accountRate.rateType,
        commit: row.commit ?? null
      }
    };
  }).filter((row) => Boolean(row)).sort((left, right) => left.totalAmount - right.totalAmount);
}
function preparePackages(value, weightInputMode) {
  if (!Array.isArray(value)) throw new Error("Agrega al menos un paquete.");
  const output = [];
  for (const draft of value) {
    if (!isRecord(draft)) continue;
    const quantity = Math.floor(Number(draft.quantity));
    const contentWeight = Number(draft.contentWeight);
    const length = Number(draft.length);
    const width = Number(draft.width);
    const height = Number(draft.height);
    const name = readText(draft.name) ?? `Paquete ${output.length + 1}`;
    const dimensionUnit = readEnum(draft.dimensionUnit, ["CM", "IN"], "CM");
    const weightUnit = readEnum(draft.weightUnit, ["KG", "LB"], "KG");
    if (![length, width, height].every((item) => Number.isFinite(item) && item > 0)) {
      throw new Error(`${name}: indica largo, ancho y alto v\xE1lidos.`);
    }
    if (!Number.isFinite(quantity) || quantity < 1) throw new Error(`${name}: la cantidad debe ser mayor a cero.`);
    if (!Number.isFinite(contentWeight) || contentWeight <= 0) throw new Error(`${name}: indica un peso v\xE1lido.`);
    const type = {
      id: readText(draft.id) ?? crypto.randomUUID(),
      carrier: "FEDEX",
      name,
      internal_code: "PRODUCTO_ORDEN",
      description: null,
      length,
      width,
      height,
      internal_length: length,
      internal_width: width,
      internal_height: height,
      external_length: length,
      external_width: width,
      external_height: height,
      max_fill_percent: null,
      box_cost: null,
      dimension_unit: dimensionUnit,
      empty_weight: 0,
      weight_unit: weightUnit,
      max_weight: null,
      is_active: true,
      sort_order: output.length + 1,
      fedex_packaging_type: "YOUR_PACKAGING",
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const tare = weightInputMode === "NET_CONTENT" ? Number(type.empty_weight) : 0;
    const actualWeight = round3(contentWeight + tare, 3);
    const volumetricWeight = calculateVolumetricWeight(type);
    const billableWeight = round3(Math.max(actualWeight, volumetricWeight), 3);
    for (let index = 0; index < quantity; index += 1) {
      output.push({
        packageType: type,
        packageTypeId: null,
        packageIndex: output.length + 1,
        contentWeight: round3(contentWeight, 3),
        tareWeight: round3(tare, 3),
        actualWeight,
        volumetricWeight,
        billableWeight
      });
    }
  }
  if (!output.length) throw new Error("Agrega al menos un paquete v\xE1lido.");
  return output;
}
function summarizePreparedPackages(packages) {
  return {
    contentWeight: round3(packages.reduce((total, item) => total + item.contentWeight, 0), 3),
    tareWeight: round3(packages.reduce((total, item) => total + item.tareWeight, 0), 3),
    billableWeight: round3(packages.reduce((total, item) => total + item.billableWeight, 0), 3)
  };
}
function applyFinalPackagingAdjustments(packages, settings) {
  const extraVolumetricWeight = calculateFinalPaddingVolumetricWeight(settings);
  if (!extraVolumetricWeight || !packages.length) return packages;
  const perPackageExtra = round3(extraVolumetricWeight / packages.length, 3);
  let assigned = 0;
  return packages.map((item, index) => {
    const extra = index === packages.length - 1 ? round3(extraVolumetricWeight - assigned, 3) : perPackageExtra;
    assigned = round3(assigned + extra, 3);
    return {
      ...item,
      billableWeight: round3(item.billableWeight + extra, 3)
    };
  });
}
function calculateFinalPaddingVolumetricWeight(settings) {
  if (settings.final_volume_padding_enabled === false) return 0;
  const length = Number(settings.final_padding_length_cm);
  const width = Number(settings.final_padding_width_cm);
  const height = Number(settings.final_padding_height_cm);
  if (![length, width, height].every((value) => Number.isFinite(value) && value > 0)) return 0;
  return round3(Math.ceil(length) * Math.ceil(width) * Math.ceil(height) / 5e3, 3);
}
function applyFinalPackagingCost(rates, settings) {
  const packagingCost = settings.final_packaging_cost_enabled === false ? 0 : Number(settings.final_packaging_material_cost);
  if (!Number.isFinite(packagingCost) || packagingCost <= 0) return rates;
  return rates.map((rate) => {
    if (rate.currency.toUpperCase() !== "MXN") {
      return {
        ...rate,
        rawSummary: {
          ...rate.rawSummary,
          finalPackagingMaterialCostPendingMxn: packagingCost
        }
      };
    }
    return {
      ...rate,
      surchargeAmount: round3((rate.surchargeAmount ?? 0) + packagingCost, 2),
      totalAmount: round3(rate.totalAmount + packagingCost, 2),
      rawSummary: {
        ...rate.rawSummary,
        finalPackagingMaterialCost: packagingCost
      }
    };
  });
}
function calculateVolumetricWeight(type) {
  const length = Number(type.external_length ?? type.length);
  const width = Number(type.external_width ?? type.width);
  const height = Number(type.external_height ?? type.height);
  if (![length, width, height].every((value) => Number.isFinite(value) && value > 0)) return 0;
  if (type.dimension_unit === "CM" && type.weight_unit === "KG") {
    return round3(Math.ceil(length) * Math.ceil(width) * Math.ceil(height) / 5e3, 3);
  }
  if (type.dimension_unit === "IN" && type.weight_unit === "LB") {
    return round3(Math.ceil(length) * Math.ceil(width) * Math.ceil(height) / 139, 3);
  }
  if (type.dimension_unit === "IN" && type.weight_unit === "KG") {
    return round3(Math.ceil(length) * Math.ceil(width) * Math.ceil(height) / 305, 3);
  }
  const lengthIn = Math.ceil(length / 2.54);
  const widthIn = Math.ceil(width / 2.54);
  const heightIn = Math.ceil(height / 2.54);
  return round3(lengthIn * widthIn * heightIn / 139, 3);
}
function normalizeAddress(value, label) {
  const source = isRecord(value) ? value : {};
  const countryCode = requiredText(source.countryCode, `Indica el pa\xEDs de ${label}.`).toUpperCase();
  const postalCode = requiredText(source.postalCode, `Indica el c\xF3digo postal de ${label}.`);
  return {
    countryCode,
    postalCode,
    stateOrProvinceCode: readText(source.stateOrProvinceCode)?.toUpperCase() ?? null,
    city: readText(source.city),
    neighborhood: readText(source.neighborhood),
    street: readText(source.street)
  };
}
function detectPartnerPostalFields(meta) {
  const preferred = ["zip", "cp", "codigo_postal", "postal_code", "zip_code", "x_cp", "x_codigo_postal", "l10n_mx_edi_zip"];
  return uniqueTexts([
    "zip",
    ...preferred.filter((field) => field in meta),
    ...Object.entries(meta).filter(([field, descriptor]) => isRecord(descriptor) && ["char", "text", "integer"].includes(`${descriptor.type ?? ""}`) && /postal|codigo.*postal|(^|_)cp(_|$)/i.test(`${field} ${descriptor.string ?? ""}`)).map(([field]) => field)
  ]);
}
function buildPartnerFields(postalFields) {
  return uniqueTexts([
    "id",
    "name",
    "display_name",
    "type",
    "email",
    "phone",
    "zip",
    ...postalFields,
    "street",
    "city",
    "state_id",
    "country_id",
    "parent_id",
    "commercial_partner_id"
  ]);
}
function detectProductLogisticsFields(meta) {
  return {
    length: detectFieldNames(meta, ["length", "product_length", "x_length", "x_length_cm", "x_largo", "x_studio_largo", "largo", "longitud"]),
    width: detectFieldNames(meta, ["width", "product_width", "x_width", "x_width_cm", "x_ancho", "x_studio_ancho", "ancho"]),
    height: detectFieldNames(meta, ["height", "product_height", "x_height", "x_height_cm", "x_alto", "x_studio_alto", "alto"])
  };
}
function detectProductReferenceFields(meta) {
  const preferred = [
    "legacy_code",
    "x_legacy_code",
    "x_codigo_legacy",
    "x_studio_codigo_legacy",
    "x_studio_referencia",
    "referencia",
    "reference",
    "default_code",
    "barcode"
  ].filter((field) => field in meta);
  const detected = Object.entries(meta).filter(([field, descriptor]) => {
    if (!isRecord(descriptor) || !["char", "text"].includes(`${descriptor.type ?? ""}`)) return false;
    const haystack = normalizeIdentifier(`${field} ${descriptor.string ?? ""}`);
    return haystack.includes("legacy") || haystack.includes("referencia") || haystack.includes("reference") || haystack.includes("codigo_interno") || haystack.includes("sku");
  }).map(([field]) => field);
  return uniqueTexts([...preferred, ...detected]);
}
function detectFieldNames(meta, preferred) {
  const preferredExisting = preferred.filter((field) => field in meta);
  const normalizedNeedles = preferred.map(normalizeIdentifier);
  const detected = Object.entries(meta).filter(([field, descriptor]) => {
    if (!isRecord(descriptor) || !["float", "integer", "monetary"].includes(`${descriptor.type ?? ""}`)) return false;
    const haystack = normalizeIdentifier(`${field} ${descriptor.string ?? ""}`);
    return normalizedNeedles.some((needle) => haystack.includes(needle));
  }).map(([field]) => field);
  return uniqueTexts([...preferredExisting, ...detected]);
}
function buildProductFields(meta, logisticsFields, referenceFields) {
  return uniqueTexts([
    "id",
    "name",
    "default_code",
    "barcode",
    "weight",
    "volume",
    "type",
    "detailed_type",
    "sale_ok",
    "categ_id",
    "product_tmpl_id",
    ...Object.values(logisticsFields).flat(),
    ...referenceFields
  ].filter((field) => field in meta));
}
function buildTemplateFields(meta, logisticsFields, referenceFields) {
  return uniqueTexts([
    "id",
    "name",
    "default_code",
    "barcode",
    "weight",
    "volume",
    "type",
    "detailed_type",
    "sale_ok",
    "categ_id",
    ...Object.values(logisticsFields).flat(),
    ...referenceFields
  ].filter((field) => field in meta));
}
function resolveProductReferenceCandidates(product, template, fields) {
  return uniqueTexts([
    readText(product.default_code),
    readText(template.default_code),
    ...fields.product.map((field) => readText(product[field])),
    ...fields.template.map((field) => readText(template[field])),
    readText(product.barcode),
    readText(template.barcode)
  ].filter((value) => Boolean(value)));
}
function isConsumableProduct(productType, productCategory) {
  const normalizedType = normalizeIdentifier(productType ?? "");
  const normalizedCategory = normalizeIdentifier(productCategory ?? "");
  return ["consu", "consumable", "consumible"].includes(normalizedType) || normalizedCategory === "consumible";
}
function mergeMissingPartnerFields(primary, fallback) {
  const merged = { ...primary };
  for (const [field, value] of Object.entries(fallback)) {
    if (hasUsableValue(merged[field])) continue;
    if (hasUsableValue(value)) merged[field] = value;
  }
  return merged;
}
function uniquePartnerRows(rows) {
  const seen = /* @__PURE__ */ new Set();
  const output = [];
  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    output.push(row);
  }
  return output;
}
function findMatchingDeliveryPartner(rows, referencePartner, postalFields) {
  const parentIds = uniqueNumbers([
    Number(referencePartner.id),
    many2oneId(referencePartner.parent_id),
    many2oneId(referencePartner.commercial_partner_id)
  ]);
  if (!parentIds.length) return null;
  const candidates = rows.filter(
    (row) => parentIds.includes(many2oneId(row.parent_id) ?? 0) && (readText(row.type) ?? "").toLowerCase() === "delivery" && Boolean(firstPostalCodeFromPartner(row, postalFields))
  );
  return candidates.find((row) => partnerNamesAreCompatible(row, referencePartner)) ?? null;
}
function partnerNamesAreCompatible(candidate, reference) {
  const candidateKeys = partnerNameKeys(candidate);
  const referenceKeys = partnerNameKeys(reference);
  return candidateKeys.some(
    (candidateKey) => referenceKeys.some(
      (referenceKey) => candidateKey === referenceKey || candidateKey.endsWith(referenceKey) || referenceKey.endsWith(candidateKey)
    )
  );
}
function partnerNameKeys(row) {
  return uniqueTexts([
    readText(row.name),
    readText(row.display_name),
    ...splitPartnerName(readText(row.name)),
    ...splitPartnerName(readText(row.display_name))
  ].map(normalizePartnerName).filter((value) => Boolean(value)));
}
function splitPartnerName(value) {
  if (!value) return [];
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}
function normalizePartnerName(value) {
  if (!value) return null;
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();
  return normalized || null;
}
function hasUsableValue(value) {
  if (value === null || value === void 0 || value === false) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
function firstNumberFromFields(row, fields) {
  for (const field of fields) {
    const value = firstNumber(row[field]);
    if (value) return value;
  }
  return null;
}
function firstPostalCodeFromPartner(row, postalFields) {
  for (const field of postalFields) {
    const text = readPostalCode(row[field]);
    if (text) return text;
  }
  return null;
}
function fedexAddress(value, residential) {
  const countryCode = readText(value.countryCode)?.toUpperCase() ?? null;
  const postalCode = normalizePostalCode(readText(value.postalCode), countryCode);
  const shouldSendLocality = countryCode === "US" || countryCode === "CA" || countryCode === "PR";
  return {
    streetLines: shouldSendLocality && readText(value.street) ? [readText(value.street)] : void 0,
    city: shouldSendLocality ? readText(value.city) ?? void 0 : void 0,
    stateOrProvinceCode: shouldSendLocality ? normalizeStateCode(readText(value.stateOrProvinceCode), countryCode) ?? void 0 : void 0,
    postalCode,
    countryCode,
    residential
  };
}
function normalizePostalCode(value, countryCode) {
  if (!value) return value;
  const normalized = countryCode === "MX" ? value.replace(/\D/g, "").slice(0, 5) : value.replace(/\s+/g, "").toUpperCase();
  return normalized || value;
}
function normalizeStateCode(value, countryCode) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if ((countryCode === "US" || countryCode === "CA" || countryCode === "PR") && normalized.length > 2) {
    return null;
  }
  return normalized;
}
function many2oneId(value) {
  if (Array.isArray(value) && value.length) {
    const parsed2 = Number(value[0]);
    return Number.isFinite(parsed2) ? parsed2 : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function many2oneLabel(value) {
  return Array.isArray(value) && value.length > 1 && typeof value[1] === "string" && value[1].trim() ? value[1].trim() : null;
}
function readPostalCode(value) {
  const text = readText(value);
  if (text) return text;
  if (typeof value === "number" && Number.isFinite(value)) return `${value}`;
  return null;
}
function resolveCountryCode(value, countryCodeById) {
  const byId = many2oneId(value);
  if (byId !== null) {
    const code2 = countryCodeById.get(byId);
    if (code2) return code2.toUpperCase();
  }
  const label = many2oneLabel(value);
  if (!label) return null;
  const code = label.match(/\(([A-Z]{2})\)$/)?.[1];
  return code ?? (label.length === 2 ? label.toUpperCase() : null);
}
function stateShortCode(value) {
  const label = many2oneLabel(value);
  if (!label) return null;
  const code = label.match(/\(([A-Z0-9]{2,4})\)$/)?.[1];
  return code ?? null;
}
function currencyLabel(value) {
  const label = many2oneLabel(value) ?? readText(value);
  if (!label) return null;
  const upper = label.toUpperCase();
  return upper.length <= 6 ? upper : label;
}
function packageSnapshot(type) {
  return {
    id: type.id,
    name: type.name,
    internal_code: type.internal_code,
    length: type.length,
    width: type.width,
    height: type.height,
    internal_length: type.internal_length,
    internal_width: type.internal_width,
    internal_height: type.internal_height,
    external_length: type.external_length,
    external_width: type.external_width,
    external_height: type.external_height,
    dimension_unit: type.dimension_unit,
    empty_weight: type.empty_weight,
    weight_unit: type.weight_unit,
    max_weight: type.max_weight,
    fedex_packaging_type: type.fedex_packaging_type
  };
}
async function assignEncryptedSecret(payload, field, value, currentEncrypted) {
  const text = readText(value);
  const encryptedKey = `${field}_encrypted`;
  const maskedKey = `${field}_masked`;
  if (!text) {
    if (currentEncrypted) return;
    payload[encryptedKey] = null;
    if (field !== "client_secret" && field !== "child_secret") payload[maskedKey] = null;
    return;
  }
  payload[encryptedKey] = await encryptSecret(text);
  if (field !== "client_secret" && field !== "child_secret") payload[maskedKey] = maskSecret(text);
}
async function encryptSecret(value) {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return JSON.stringify({
    v: 1,
    iv: encodeBase64(iv),
    data: encodeBase64(new Uint8Array(encrypted))
  });
}
async function decryptSecret(value) {
  if (!value) return null;
  const parsed = JSON.parse(value);
  if (!parsed.iv || !parsed.data) return null;
  const key = await getCryptoKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(parsed.iv) },
    key,
    decodeBase64(parsed.data)
  );
  return new TextDecoder().decode(decrypted);
}
async function getCryptoKey() {
  const secret = Deno.env.get("SHIPPING_CREDENTIALS_KEY")?.trim();
  if (!secret || secret.length < 16) {
    throw new Error("Falta configurar SHIPPING_CREDENTIALS_KEY en los secretos de la Edge Function.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function audit(adminClient, input) {
  const { error } = await adminClient.from("shipping_settings_audit").insert({
    actor_user_id: input.actorId,
    actor_email: input.actorEmail ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    previous_value: input.previousValue,
    new_value: input.newValue
  });
  if (error) console.error("[shipping-quote:audit]", sanitizeError(error));
}
function money(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { amount: round3(value, 2), currency: null };
  }
  if (!isRecord(value)) return null;
  const amount = Number(value.amount);
  if (!Number.isFinite(amount)) return null;
  return {
    amount: round3(amount, 2),
    currency: readText(value.currency)
  };
}
function sumMoneyArray(value) {
  if (!Array.isArray(value)) return null;
  const total = value.reduce((sum2, item) => {
    if (!isRecord(item)) return sum2;
    const direct = money(item.amount) ?? money(item.surchargeAmount) ?? money(item.discountAmount) ?? money(item.taxAmount);
    return sum2 + (direct?.amount ?? 0);
  }, 0);
  return total > 0 ? round3(total, 2) : null;
}
function normalizeShippingError(error, userMessage) {
  if (error instanceof ShippingError) {
    if (!userMessage || userMessage === error.message) return error;
    return new ShippingError(userMessage, {
      status: error.status,
      code: error.code,
      retryable: error.retryable,
      providerStatus: error.providerStatus,
      diagnosticStage: error.diagnosticStage,
      environment: error.environment,
      providerCode: error.providerCode,
      providerMessage: error.providerMessage,
      providerTransactionId: error.providerTransactionId,
      providerEndpoint: error.providerEndpoint
    });
  }
  const technicalMessage = sanitizeErrorText(error);
  const message = technicalMessage.toLowerCase();
  const fallbackMessage = userMessage ?? (error instanceof Error ? error.message : "No se pudo completar la solicitud del Cotizador de Env\xEDos.");
  if (message.includes("system.unavailable.exception") || message.includes("unable to process this request") || message.includes("service is currently unavailable") || message.includes("temporarily unavailable") || message.includes("check back at a later time") || /\(503\)/.test(message)) {
    return new ShippingError(fallbackMessage, { status: 503, code: "FEDEX_UNAVAILABLE", retryable: true, providerStatus: 503 });
  }
  if (/\(429\)/.test(message) || message.includes("too many requests")) {
    return new ShippingError(fallbackMessage, { status: 429, code: "FEDEX_RATE_LIMITED", retryable: true, providerStatus: 429 });
  }
  if (/\((502|504)\)/.test(message) || message.includes("timeout") || message.includes("network") || message.includes("fetch failed")) {
    return new ShippingError(fallbackMessage, { status: 503, code: "FEDEX_TEMPORARY_ERROR", retryable: true, providerStatus: extractProviderStatus(technicalMessage, [502, 504]) });
  }
  if (/\((401|403)\)/.test(message) || message.includes("forbidden.error") || message.includes("could not authorize your credentials") || message.includes("oauth") || message.includes("autentic")) {
    return new ShippingError(fallbackMessage, { status: 502, code: "FEDEX_AUTH_ERROR", retryable: false, providerStatus: extractProviderStatus(technicalMessage, [401, 403]) });
  }
  if (/\(400\)/.test(message) || message.includes("service.packagecombination.invalid") || message.includes("postal") || message.includes("zip") || message.includes("weight") || message.includes("peso") || message.includes("dimension") || message.includes("no devolvi\xF3 servicios disponibles")) {
    return new ShippingError(fallbackMessage, { status: 422, code: message.includes("no devolvi\xF3 servicios disponibles") ? "FEDEX_NO_RATES" : "FEDEX_REQUEST_REJECTED", retryable: false, providerStatus: /\(400\)/.test(message) ? 400 : null });
  }
  if (message.includes("fedex")) {
    return new ShippingError(fallbackMessage, { status: 502, code: "FEDEX_ERROR", retryable: false, providerStatus: extractProviderStatus(technicalMessage) });
  }
  return new ShippingError(fallbackMessage, { status: 500, code: "INTERNAL_ERROR", retryable: false, providerStatus: null });
}
function extractProviderStatus(value, allowed) {
  const match = value.match(/\((\d{3})\)/);
  if (!match) return null;
  const status = Number(match[1]);
  if (!Number.isFinite(status) || allowed && !allowed.includes(status)) return null;
  return status;
}
function mapFedexError(error) {
  const technicalMessage = sanitizeErrorText(error);
  const message = technicalMessage.toLowerCase();
  const provider = error instanceof ShippingError ? {
    code: error.providerCode,
    message: error.providerMessage,
    transactionId: error.providerTransactionId
  } : parseFedexErrorDetails(technicalMessage);
  if (message.includes("system.unavailable.exception") || message.includes("unable to process this request") || message.includes("service is currently unavailable") || message.includes("temporarily unavailable") || message.includes("check back at a later time")) {
    const transactionId = provider.transactionId ?? extractFedexTransactionId(technicalMessage);
    return `FedEx Rate API est\xE1 temporalmente no disponible. La solicitud se reintent\xF3 autom\xE1ticamente; vuelve a intentarlo en unos minutos.${transactionId ? ` Referencia FedEx: ${transactionId}.` : ""}`;
  }
  if (message.includes("service.packagecombination.invalid") || message.includes("combinaci\xF3n de servicio y embalaje")) {
    return "FedEx rechaz\xF3 la combinaci\xF3n de servicio y embalaje. Revisa que el env\xEDo use embalaje propio, dimensiones reales y que no combine servicios One Rate con varios bultos.";
  }
  if (message.includes("oauth") || message.includes("autentic") || message.includes("forbidden.error") || message.includes("could not authorize your credentials")) {
    return "FedEx rechaz\xF3 las credenciales para Rate API. Verifica que Account Number, Client ID y Client Secret sean del mismo proyecto y ambiente de FedEx.";
  }
  if (message.includes("postal") || message.includes("zip")) return "FedEx no pudo validar el c\xF3digo postal. Revisa que origen y destino sean c\xF3digos postales mexicanos de 5 d\xEDgitos.";
  if (message.includes("weight") || message.includes("peso")) return "FedEx rechaz\xF3 el peso del paquete. Revisa peso, tara y m\xE1ximo permitido.";
  if (message.includes("dimension")) return "FedEx rechaz\xF3 las dimensiones del paquete. Revisa largo, ancho y alto.";
  if (message.includes("no devolvi\xF3 servicios disponibles")) {
    return "FedEx respondi\xF3 correctamente, pero no devolvi\xF3 servicios disponibles para ese origen, destino y paquete. Revisa que la cuenta Sandbox tenga servicios nacionales M\xE9xico habilitados para esos c\xF3digos postales.";
  }
  if (message.includes("timeout") || message.includes("network") || message.includes("fetch")) return "FedEx no respondi\xF3 a tiempo. Intenta nuevamente en unos minutos.";
  const fedexDetail = extractFedexErrorMessage(technicalMessage);
  return fedexDetail ? `FedEx rechaz\xF3 la cotizaci\xF3n: ${fedexDetail}` : "FedEx no pudo generar tarifas para esta combinaci\xF3n de origen, destino y embalajes. Revisa la configuraci\xF3n de la cuenta Sandbox/Producci\xF3n y vuelve a calcular el embalaje.";
}
function extractFedexErrorMessage(value) {
  const provider = parseFedexErrorDetails(value);
  return [provider.code, provider.message].filter(Boolean).join(" ") || null;
}
function extractFedexTransactionId(value) {
  return parseFedexErrorDetails(value).transactionId;
}
function parseFedexErrorDetails(value) {
  const payload = parseJsonObject(value.trim()) ?? parseJsonObject(value.match(/\{[\s\S]*\}/)?.[0] ?? "");
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const first = errors.find(isRecord) ?? null;
  return {
    transactionId: readText(payload?.transactionId),
    code: first ? readText(first.code) : null,
    message: first ? readText(first.message) : null
  };
}
function mexicoBusinessDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(/* @__PURE__ */ new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function safeFedexText(value) {
  return value.replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"[oculto]"').replace(/"client_secret"\s*:\s*"[^"]+"/gi, '"client_secret":"[oculto]"').replace(/"client_id"\s*:\s*"[^"]+"/gi, '"client_id":"[oculto]"').replace(/"accountNumber"\s*:\s*\{\s*"value"\s*:\s*"[^"]+"\s*\}/gi, '"accountNumber":{"value":"[oculto]"}').slice(0, 800);
}
function sanitizeFedexPayload(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeFedexPayload(item));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const lowerKey = key.toLowerCase();
    if (["access_token", "client_secret", "client_id", "secret", "password"].includes(lowerKey)) {
      return [key, "[oculto]"];
    }
    if (key === "accountNumber" && isRecord(item) && "value" in item) {
      return [key, { ...item, value: "[oculto]" }];
    }
    return [key, sanitizeFedexPayload(item)];
  }));
}
function sanitizeError(error) {
  return sanitizeErrorText(error).slice(0, 1e3);
}
function sanitizeErrorText(error) {
  return error instanceof Error ? safeFedexText(error.message) : safeFedexText(String(error));
}
function maskSecret(value) {
  const clean = value.trim();
  return clean.length <= 4 ? "\u2022\u2022\u2022\u2022" : `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${clean.slice(-4)}`;
}
function normalizeFedexAccountNumber(value) {
  const text = readText(value);
  if (!text) return null;
  const normalized = text.replace(/[\s-]+/g, "");
  if (!/^\d+$/.test(normalized)) {
    throw new Error("El Account Number de FedEx debe contener solo n\xFAmeros. Quita espacios, guiones u otros caracteres.");
  }
  return normalized;
}
function encodeBase64(value) {
  return btoa(String.fromCharCode(...value));
}
function decodeBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function readText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function requiredText(value, message) {
  const text = readText(value);
  if (!text) throw new Error(message);
  return text;
}
function nullablePositive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function nullableInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}
function nullableNonNegative(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function requiredPositiveNumber(value, message) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(message);
  return parsed;
}
function readEnum(value, allowed, fallback) {
  const text = readText(value)?.toUpperCase();
  return allowed.includes(text) ? text : fallback;
}
function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function firstBoolean(...values) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return null;
}
function firstNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}
function parseProductDimensionsWorkbook(fileBase64) {
  const workbook = XLSX.read(decodeBase64(fileBase64), { type: "array" });
  const sheetName = workbook.SheetNames.find((name) => workbook.Sheets[name]) ?? workbook.SheetNames[0];
  if (!sheetName) throw new Error("El archivo Excel no contiene hojas para importar.");
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  const rows = [];
  const invalidRows = [];
  const bySku = /* @__PURE__ */ new Map();
  rawRows.forEach((raw, index) => {
    const sourceRow = index + 2;
    const normalized = normalizeWorkbookRow(raw);
    const sku = readText(normalized.equipo ?? normalized.sku ?? normalized.codigo ?? normalized.codigo_interno);
    const width = firstNumber(normalized.ancho, normalized.width, normalized.width_cm);
    const length = firstNumber(normalized.largo, normalized.length, normalized.length_cm);
    const height = firstNumber(normalized.alto, normalized.height, normalized.height_cm);
    const realWeight = firstNumber(normalized.peso_real, normalized.peso, normalized.weight, normalized.weight_kg);
    const volumetricWeight = firstNumber(normalized.peso_volumetrico, normalized.peso_volumetrico_kg, normalized.volumetric_weight);
    const roundedWeight = firstNumber(normalized.redondeo, normalized.peso_redondeado);
    const billableWeight = roundedWeight ?? maxPositive(realWeight, volumetricWeight);
    const productName = readText(normalized.descripcion ?? normalized.description ?? normalized.nombre ?? normalized.producto);
    if (!sku) {
      invalidRows.push({ row: sourceRow, reason: "Falta Equipo/SKU." });
      return;
    }
    if (!width || !length || !height) {
      invalidRows.push({ row: sourceRow, reason: "Faltan dimensiones v\xE1lidas." });
      return;
    }
    if (!billableWeight && !realWeight && !volumetricWeight) {
      invalidRows.push({ row: sourceRow, reason: "Falta peso real o peso volum\xE9trico." });
      return;
    }
    const row = {
      sku: sku.toUpperCase(),
      product_name: productName,
      width_cm: round3(width, 2),
      length_cm: round3(length, 2),
      height_cm: round3(height, 2),
      unit_weight_kg: realWeight ? round3(realWeight, 3) : null,
      volumetric_weight_kg: volumetricWeight ? round3(volumetricWeight, 3) : null,
      billable_weight_kg: billableWeight ? round3(billableWeight, 3) : null,
      source_row: sourceRow
    };
    bySku.set(normalizeSku(row.sku), row);
  });
  rows.push(...bySku.values());
  if (!rows.length) {
    throw new Error("No se encontraron productos v\xE1lidos en el Excel. Verifica columnas Equipo, Ancho, Largo, Alto y Peso.");
  }
  return { rows, invalidRows };
}
function normalizeWorkbookRow(raw) {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [normalizeIdentifier(key), value])
  );
}
function normalizeProductDimensionImportRow(value) {
  if (!isRecord(value)) return null;
  const sku = readText(value.sku);
  const width = firstNumber(value.width_cm);
  const length = firstNumber(value.length_cm);
  const height = firstNumber(value.height_cm);
  const billableWeight = firstNumber(value.billable_weight_kg, value.unit_weight_kg, value.volumetric_weight_kg);
  if (!sku || !width || !length || !height || !billableWeight) return null;
  return {
    sku: sku.toUpperCase(),
    product_name: readText(value.product_name),
    width_cm: round3(width, 2),
    length_cm: round3(length, 2),
    height_cm: round3(height, 2),
    unit_weight_kg: firstNumber(value.unit_weight_kg) ? round3(firstNumber(value.unit_weight_kg), 3) : null,
    volumetric_weight_kg: firstNumber(value.volumetric_weight_kg) ? round3(firstNumber(value.volumetric_weight_kg), 3) : null,
    billable_weight_kg: round3(billableWeight, 3),
    source_row: Math.max(1, Number(value.source_row) || 1)
  };
}
function productDimensionChanged(existing, incoming) {
  return normalizeComparableText(existing.product_name) !== normalizeComparableText(incoming.product_name) || compareNumber(existing.width_cm, incoming.width_cm, 2) || compareNumber(existing.length_cm, incoming.length_cm, 2) || compareNumber(existing.height_cm, incoming.height_cm, 2) || compareNumber(existing.unit_weight_kg, incoming.unit_weight_kg, 3) || compareNumber(existing.volumetric_weight_kg, incoming.volumetric_weight_kg, 3) || compareNumber(existing.billable_weight_kg, incoming.billable_weight_kg, 3);
}
function compareNumber(left, right, decimals) {
  const leftNumber = firstNumber(left);
  const rightNumber = firstNumber(right);
  if (!leftNumber && !rightNumber) return false;
  return round3(leftNumber ?? 0, decimals) !== round3(rightNumber ?? 0, decimals);
}
function maxPositive(...values) {
  const positives = values.filter((value) => Number.isFinite(value ?? NaN) && (value ?? 0) > 0);
  return positives.length ? Math.max(...positives) : null;
}
function normalizeSku(value) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}
function normalizeComparableText(value) {
  return readText(value)?.trim().toUpperCase() ?? null;
}
function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value ?? NaN)))];
}
function uniqueTexts(values) {
  return [...new Set(values.filter(Boolean))];
}
function normalizeIdentifier(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function trimSlash2(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
function normalizeFedexBaseUrl(value, environment) {
  const fallback = environment === "PRODUCTION" ? "https://apis.fedex.com" : "https://apis-sandbox.fedex.com";
  const normalized = trimSlash2((value || fallback).trim());
  if (!/^https:\/\/apis(-sandbox)?\.fedex\.com$/i.test(normalized)) {
    throw new Error("La URL de FedEx debe ser https://apis-sandbox.fedex.com o https://apis.fedex.com.");
  }
  return normalized;
}
function round3(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function escapeLike(value) {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
