import type { ShippingPackageType } from '../../lib/types';

const TOP_PACKING_PLANS = 7;
const MAX_PACKING_ITERATIONS = 28;
const MAX_PACKING_TIME_MS = 650;

export type PackingItem = {
  lineId: number;
  productId: number;
  sku: string | null;
  productName: string;
  unitIndex: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  canRotate: boolean;
  canStack: boolean;
  shipAlone: boolean;
  fragile: boolean;
  packingGroup: string | null;
};

export type PackedItem = {
  lineId: number;
  productId: number;
  sku: string | null;
  productName: string;
  unitIndex: number;
  weightKg: number;
  canStack?: boolean;
  shipAlone?: boolean;
  fragile?: boolean;
  packingGroup?: string | null;
  position?: { x: number; y: number; z: number };
  orientation?: { length: number; width: number; height: number };
};

export type PackedPackage = {
  id: string;
  packageIndex: number;
  packagingId: string;
  packagingName: string;
  externalLengthCm: number;
  externalWidthCm: number;
  externalHeightCm: number;
  actualWeightKg: number;
  productsWeightKg: number;
  tareWeightKg: number;
  maxWeightKg: number;
  usedVolumeCm3: number;
  usableVolumeCm3: number;
  utilizationPercent: number;
  items: PackedItem[];
};

export type PackingPlan = {
  id: string;
  strategy: PackingStrategy;
  variantName?: string;
  packages: PackedPackage[];
  totalPackages: number;
  totalActualWeightKg: number;
  estimatedVolumetricWeightKg: number;
  estimatedBillableWeightKg: number;
  averageUtilizationPercent: number;
  valid: boolean;
  warnings: string[];
  score?: number;
  explanation?: string;
};

export type PackingStrategy =
  | 'ANCHOR_BALANCED'
  | 'DIMENSIONAL_WEIGHT'
  | 'BEST_VOLUME_UTILIZATION'
  | 'SMALLEST_BOX_FIRST'
  | 'SAME_BOX_TYPE'
  | 'WEIGHT_FIRST'
  | 'MIN_PACKAGES'
  | 'SEPARATE_EACH_UNIT';

type ProductGroup = {
  productId: number;
  sku: string | null;
  productName: string;
  items: PackingItem[];
  quantity: number;
  volumeCm3: number;
  weightKg: number;
};

type PackingBox = {
  id: string;
  name: string;
  internalLengthCm: number;
  internalWidthCm: number;
  internalHeightCm: number;
  externalLengthCm: number;
  externalWidthCm: number;
  externalHeightCm: number;
  tareWeightKg: number;
  maxWeightKg: number;
  maxFillPercent: number;
  boxCost: number;
};

type CompatibilityMatrix = Map<string, Set<string>>;

type OpenPackage = {
  box: PackingBox;
  items: PackedItem[];
  freeSpaces: Space[];
  usedVolumeCm3: number;
  productsWeightKg: number;
};

type Space = {
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
};

type Orientation = {
  length: number;
  width: number;
  height: number;
};

type Placement = {
  space: Space;
  orientation: Orientation;
  waste: number;
  dimensionSlack: number;
};

export function expandOrderItems(lines: Array<{
  lineId: number;
  productId: number;
  sku: string | null;
  productName: string;
  quantity: number;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightKg: number | null;
  canRotate?: boolean;
  canStack?: boolean;
  shipAlone?: boolean;
  fragile?: boolean;
  packingGroup?: string | null;
}>) {
  const items: PackingItem[] = [];
  const errors: string[] = [];

  for (const line of lines) {
    const quantity = Math.floor(Number(line.quantity));
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity !== line.quantity) {
      errors.push(`${line.productName}: la cantidad debe ser un número entero mayor a cero.`);
      continue;
    }

    const missing = [
      !isPositive(line.lengthCm) ? 'largo' : null,
      !isPositive(line.widthCm) ? 'ancho' : null,
      !isPositive(line.heightCm) ? 'alto' : null,
      !isPositive(line.weightKg) ? 'peso' : null,
    ].filter(Boolean);

    if (missing.length) {
      errors.push(`${line.productName}: falta ${missing.join(', ')}.`);
      continue;
    }

    for (let index = 0; index < quantity; index += 1) {
      items.push({
        lineId: line.lineId,
        productId: line.productId,
        sku: line.sku,
        productName: line.productName,
        unitIndex: index + 1,
        lengthCm: Number(line.lengthCm),
        widthCm: Number(line.widthCm),
        heightCm: Number(line.heightCm),
        weightKg: round(Number(line.weightKg), 3),
        canRotate: line.canRotate !== false,
        canStack: line.canStack !== false,
        shipAlone: line.shipAlone === true,
        fragile: line.fragile === true,
        packingGroup: line.packingGroup ?? null,
      });
    }
  }

  return { items, errors };
}

export function generatePackingPlans(
  items: PackingItem[],
  packageTypes: ShippingPackageType[],
  strategies: PackingStrategy[] = [
    'ANCHOR_BALANCED',
    'DIMENSIONAL_WEIGHT',
    'BEST_VOLUME_UTILIZATION',
    'SMALLEST_BOX_FIRST',
    'WEIGHT_FIRST',
    'MIN_PACKAGES',
    'SEPARATE_EACH_UNIT',
  ],
) {
  const startedAt = performanceNow();
  const boxes = packageTypes
    .filter((item) => item.is_active)
    .map(normalizeBox)
    .filter((item): item is PackingBox => Boolean(item));

  if (!boxes.length) {
    return [invalidPlan('sin-embalajes', 'SMALLEST_BOX_FIRST', ['No existen embalajes activos. Configura al menos un embalaje para continuar.'])];
  }

  const groups = groupItems(items);
  const matrix = buildCompatibilityMatrix(groups, boxes);
  const unpackableWarnings = unpackableProductWarnings(groups, matrix);
  if (unpackableWarnings.length) {
    return [invalidPlan('productos-sin-embalaje', 'ANCHOR_BALANCED', unpackableWarnings)];
  }

  const candidates: PackingPlan[] = [];

  for (const box of boxes) {
    if (performanceNow() - startedAt > MAX_PACKING_TIME_MS) break;
    const sameBoxItems = orderItemsForStrategy(items, 'ANCHOR_BALANCED', 0);
    const sameBoxLowerBound = calculateLowerBound(sameBoxItems, [box], matrix);
    const sameBoxPlan = buildPlan(sameBoxItems, [box], 'SAME_BOX_TYPE', sameBoxLowerBound, box.name);
    candidates.push(optimizePlan(sameBoxPlan, [box]));
  }

  const strategyQueue = buildStrategyQueue(strategies);
  for (let index = 0; index < strategyQueue.length && index < MAX_PACKING_ITERATIONS; index += 1) {
    if (performanceNow() - startedAt > MAX_PACKING_TIME_MS) break;
    const candidate = strategyQueue[index];
    const orderedItems = orderItemsForStrategy(items, candidate.strategy, candidate.seed);
    const orderedBoxes = sortBoxesForStrategy(boxes, candidate.strategy, groups);
    const lowerBound = calculateLowerBound(orderedItems, orderedBoxes, matrix);
    const plan = candidate.strategy === 'SEPARATE_EACH_UNIT'
      ? buildSeparateEachUnitPlan(orderedItems, orderedBoxes)
      : buildPlan(orderedItems, orderedBoxes, candidate.strategy, lowerBound);
    candidates.push(optimizePlan(plan, boxes));
  }

  return selectTopPlans(candidates);
}

function buildPlan(items: PackingItem[], boxes: PackingBox[], strategy: PackingStrategy, lowerBound: number, variantName?: string): PackingPlan {
  const warnings: string[] = [];
  const openPackages: OpenPackage[] = [];

  for (const item of items) {
    if (item.shipAlone) {
      const dedicated = boxes.find((box) => canFitEmpty(box, item));
      if (!dedicated) {
        warnings.push(`${item.productName}: no cabe en ninguno de los embalajes activos.`);
        continue;
      }
      const pkg = createOpenPackage(dedicated);
      placeItem(pkg, item);
      openPackages.push(pkg);
      continue;
    }

    const target = findBestOpenPackage(openPackages, item, strategy);
    if (target) {
      placeItem(target.pkg, item, target.placement);
      continue;
    }

    const nextBox = chooseNewBox(boxes, item, strategy);
    if (!nextBox) {
      warnings.push(`${item.productName}: no cabe en ninguno de los embalajes activos o supera el peso máximo.`);
      continue;
    }
    const nextPackage = createOpenPackage(nextBox);
    placeItem(nextPackage, item);
    openPackages.push(nextPackage);
  }

  const plan = toPlan(strategy, openPackages, warnings, lowerBound);
  return {
    ...plan,
    id: variantName ? `${strategy}-${safeId(variantName)}-${signature(plan.packages)}` : plan.id,
    variantName,
    explanation: plan.valid
      ? strategy === 'SAME_BOX_TYPE' && variantName
        ? `Se llenó el embalaje ${variantName} hasta donde cupo físicamente y se abrió otro del mismo tipo solo cuando fue necesario.`
        : `Se llenaron ${plan.totalPackages} embalaje(s) activos priorizando ${formatStrategyText(strategy)} y espacios disponibles.`
      : undefined,
  };
}

function buildSeparateEachUnitPlan(items: PackingItem[], boxes: PackingBox[]): PackingPlan {
  const warnings: string[] = [];
  const openPackages: OpenPackage[] = [];

  for (const item of items) {
    const box = boxes.find((candidate) => canFitEmpty(candidate, item));
    if (!box) {
      warnings.push(`${item.productName}: no cabe en ninguno de los embalajes activos o supera el peso máximo.`);
      continue;
    }
    const pkg = createOpenPackage(box);
    placeItem(pkg, item);
    openPackages.push(pkg);
  }

  return {
    ...toPlan('SEPARATE_EACH_UNIT', openPackages, warnings, items.length),
    explanation: 'Cada unidad se empacó por separado para comparar tarifas multi-bulto contra alternativas consolidadas.',
  };
}

function optimizePlan(plan: PackingPlan, boxes: PackingBox[]) {
  if (!plan.valid || plan.strategy === 'SEPARATE_EACH_UNIT') return plan;
  let current = plan;
  let improved = true;
  let attempts = 0;
  while (improved && attempts < 4) {
    attempts += 1;
    improved = false;
    const merged = mergeSmallestPackage(current, boxes);
    if (isBetterPlan(merged, current)) {
      current = { ...merged, explanation: 'Se eliminó una caja redistribuyendo su contenido en embalajes existentes.' };
      improved = true;
      continue;
    }
    const resized = resizeUnderfilledPackages(current, boxes);
    if (isBetterPlan(resized, current)) {
      current = { ...resized, explanation: 'Se reemplazaron cajas poco ocupadas por embalajes más ajustados.' };
      improved = true;
    }
  }
  return current;
}

function mergeSmallestPackage(plan: PackingPlan, boxes: PackingBox[]) {
  if (plan.packages.length < 2) return plan;
  const source = [...plan.packages].sort((left, right) => left.usedVolumeCm3 - right.usedVolumeCm3)[0];
  const remainingItems = plan.packages
    .filter((pkg) => pkg.id !== source.id)
    .flatMap((pkg) => pkg.items.map(toPackingItem));
  const mergedItems = [...remainingItems, ...source.items.map(toPackingItem)];
  const rebuilt = buildPlan(
    orderItemsForStrategy(mergedItems, plan.strategy, 0),
    sortBoxesForStrategy(boxes, plan.strategy, groupItems(mergedItems)),
    plan.strategy,
    1,
  );
  return rebuilt.valid ? rebuilt : plan;
}

function resizeUnderfilledPackages(plan: PackingPlan, boxes: PackingBox[]) {
  const allItems = plan.packages.flatMap((pkg) => pkg.items.map(toPackingItem));
  const rebuilt = buildPlan(
    orderItemsForStrategy(allItems, plan.strategy, 1),
    sortBoxesForStrategy(boxes, 'DIMENSIONAL_WEIGHT', groupItems(allItems)),
    plan.strategy,
    1,
  );
  return rebuilt.valid ? rebuilt : plan;
}

function findBestOpenPackage(openPackages: OpenPackage[], item: PackingItem, strategy: PackingStrategy) {
  const candidates = openPackages
    .filter((pkg) => canCombine(pkg, item))
    .map((pkg) => ({ pkg, placement: findPlacement(pkg, item) }))
    .filter((row): row is { pkg: OpenPackage; placement: Placement } => Boolean(row.placement))
    .sort((left, right) => placementScore(left.pkg, left.placement, item, strategy) - placementScore(right.pkg, right.placement, item, strategy));
  return candidates[0] ?? null;
}

function chooseNewBox(boxes: PackingBox[], item: PackingItem, strategy: PackingStrategy) {
  return boxes
    .filter((candidate) => canFitEmpty(candidate, item))
    .map((box) => ({ box, score: newBoxScore(box, item, strategy) }))
    .sort((left, right) => left.score - right.score)[0]?.box ?? null;
}

function buildStrategyQueue(strategies: PackingStrategy[]) {
  const queue = strategies.map((strategy) => ({ strategy, seed: 0 }));
  for (let seed = 1; seed <= 4; seed += 1) {
    queue.push(
      { strategy: 'ANCHOR_BALANCED' as PackingStrategy, seed },
      { strategy: 'DIMENSIONAL_WEIGHT' as PackingStrategy, seed },
      { strategy: 'BEST_VOLUME_UTILIZATION' as PackingStrategy, seed },
      { strategy: 'WEIGHT_FIRST' as PackingStrategy, seed },
    );
  }
  return queue.filter((item, index, source) => source.findIndex((candidate) => candidate.strategy === item.strategy && candidate.seed === item.seed) === index);
}

function groupItems(items: PackingItem[]) {
  const groups = new Map<string, ProductGroup>();
  for (const item of items) {
    const key = `${item.productId}:${item.lengthCm}:${item.widthCm}:${item.heightCm}:${item.weightKg}:${item.canRotate}`;
    const current = groups.get(key);
    if (current) {
      current.items.push(item);
      current.quantity += 1;
      continue;
    }
    groups.set(key, {
      productId: item.productId,
      sku: item.sku,
      productName: item.productName,
      items: [item],
      quantity: 1,
      volumeCm3: itemVolume(item),
      weightKg: item.weightKg,
    });
  }
  return [...groups.values()];
}

function buildCompatibilityMatrix(groups: ProductGroup[], boxes: PackingBox[]): CompatibilityMatrix {
  const matrix: CompatibilityMatrix = new Map();
  for (const group of groups) {
    const compatible = new Set<string>();
    const item = group.items[0];
    for (const box of boxes) {
      if (canFitEmpty(box, item)) compatible.add(box.id);
    }
    matrix.set(groupKey(group), compatible);
  }
  return matrix;
}

function unpackableProductWarnings(groups: ProductGroup[], matrix: CompatibilityMatrix) {
  return groups
    .filter((group) => !matrix.get(groupKey(group))?.size)
    .map((group) => {
      const item = group.items[0];
      return `${group.productName}${group.sku ? ` (${group.sku})` : ''}: no cabe en ningún embalaje activo. Dimensiones ${item.lengthCm} × ${item.widthCm} × ${item.heightCm} cm, peso ${item.weightKg} kg.`;
    });
}

function calculateLowerBound(items: PackingItem[], boxes: PackingBox[], matrix: CompatibilityMatrix) {
  const totalVolume = items.reduce((total, item) => total + itemVolume(item), 0);
  const totalWeight = items.reduce((total, item) => total + item.weightKg, 0);
  const mostUsefulBox = [...boxes].sort((left, right) => usableVolume(right) - usableVolume(left))[0];
  if (!mostUsefulBox) return 1;
  const minimumBoxesByVolume = Math.ceil(totalVolume / Math.max(usableVolume(mostUsefulBox), 1));
  const minimumBoxesByWeight = Math.ceil(totalWeight / Math.max(mostUsefulBox.maxWeightKg - mostUsefulBox.tareWeightKg, 0.001));
  const shipAloneBoxes = items.filter((item) => item.shipAlone).length;
  const incompatibleGroups = [...matrix.values()].filter((value) => !value.size).length;
  return Math.max(1, minimumBoxesByVolume, minimumBoxesByWeight, shipAloneBoxes, incompatibleGroups);
}

function orderItemsForStrategy(items: PackingItem[], strategy: PackingStrategy, seed: number) {
  const scored = [...items].map((item, index) => ({ item, index, score: itemScore(item, strategy) + seededNoise(item, seed) }));
  return scored.sort((left, right) => right.score - left.score || left.index - right.index).map((row) => row.item);
}

function itemScore(item: PackingItem, strategy: PackingStrategy) {
  const maxSide = Math.max(item.lengthCm, item.widthCm, item.heightCm);
  const volumeScore = itemVolume(item);
  const restrictionScore = (item.shipAlone ? 10 ** 10 : 0) + (!item.canRotate ? 10 ** 8 : 0) + (item.fragile ? 10 ** 7 : 0);
  if (strategy === 'WEIGHT_FIRST') return restrictionScore + item.weightKg * 1_000_000 + maxSide * 10_000 + volumeScore;
  if (strategy === 'BEST_VOLUME_UTILIZATION') return restrictionScore + volumeScore * 10 + maxSide * 1_000 + item.weightKg * 100;
  if (strategy === 'SMALLEST_BOX_FIRST') return restrictionScore + maxSide * 10_000 + volumeScore + item.weightKg * 100;
  return restrictionScore + maxSide * 100_000 + volumeScore * 2 + item.weightKg * 1_000;
}

function sortBoxesForStrategy(boxes: PackingBox[], strategy: PackingStrategy, groups: ProductGroup[]) {
  const sorted = [...boxes];
  const lowerBoundByBox = new Map(sorted.map((box) => [box.id, lowerBoundForBox(box, groups)]));
  if (strategy === 'MIN_PACKAGES') return sorted.sort((left, right) => lowerBoundByBox.get(left.id)! - lowerBoundByBox.get(right.id)! || boxVolume(right) - boxVolume(left));
  if (strategy === 'DIMENSIONAL_WEIGHT') return sorted.sort((left, right) => externalVolumetricWeight(left) - externalVolumetricWeight(right) || boxVolume(left) - boxVolume(right));
  if (strategy === 'BEST_VOLUME_UTILIZATION') return sorted.sort((left, right) => boxVolume(left) - boxVolume(right));
  if (strategy === 'WEIGHT_FIRST') return sorted.sort((left, right) => left.maxWeightKg - right.maxWeightKg || boxVolume(left) - boxVolume(right));
  if (strategy === 'ANCHOR_BALANCED') {
    return sorted.sort((left, right) => lowerBoundByBox.get(left.id)! - lowerBoundByBox.get(right.id)! || externalVolumetricWeight(left) - externalVolumetricWeight(right));
  }
  return sorted.sort((left, right) => boxVolume(left) - boxVolume(right));
}

function lowerBoundForBox(box: PackingBox, groups: ProductGroup[]) {
  const totalVolume = groups.reduce((total, group) => total + group.volumeCm3 * group.quantity, 0);
  const totalWeight = groups.reduce((total, group) => total + group.weightKg * group.quantity, 0);
  return Math.max(
    Math.ceil(totalVolume / Math.max(usableVolume(box), 1)),
    Math.ceil(totalWeight / Math.max(box.maxWeightKg - box.tareWeightKg, 0.001)),
  );
}

function placementScore(pkg: OpenPackage, placement: Placement, item: PackingItem, strategy: PackingStrategy) {
  const nextUsedVolume = pkg.usedVolumeCm3 + volume(placement.orientation);
  const nextWeight = pkg.productsWeightKg + item.weightKg + pkg.box.tareWeightKg;
  const fillPercent = nextUsedVolume / Math.max(usableVolume(pkg.box), 1);
  const weightPercent = nextWeight / Math.max(pkg.box.maxWeightKg, 1);
  const dimensionalPenalty = externalVolumetricWeight(pkg.box);
  const strategyBias = strategy === 'BEST_VOLUME_UTILIZATION' ? -fillPercent * 500 : strategy === 'WEIGHT_FIRST' ? -weightPercent * 300 : 0;
  return placement.waste + placement.dimensionSlack * 8 + dimensionalPenalty * 35 + strategyBias;
}

function newBoxScore(box: PackingBox, item: PackingItem, strategy: PackingStrategy) {
  const usedVolume = itemVolume(item);
  const fillPercent = usedVolume / Math.max(usableVolume(box), 1);
  const billable = Math.max(item.weightKg + box.tareWeightKg, externalVolumetricWeight(box));
  const emptyVolumePenalty = (1 - Math.min(fillPercent, 1)) * 250;
  const packagePenalty = strategy === 'MIN_PACKAGES' ? -boxVolume(box) / 200 : 0;
  return billable * 100 + emptyVolumePenalty + box.boxCost + packagePenalty;
}

function canFitEmpty(box: PackingBox, item: PackingItem) {
  return item.weightKg + box.tareWeightKg <= box.maxWeightKg && getOrientations(item).some((orientation) => fits(box, orientation));
}

function canCombine(pkg: OpenPackage, item: PackingItem) {
  if (pkg.items.some((existing) => existing.shipAlone)) return false;
  if (item.fragile && pkg.items.some((existing) => existing.productId !== item.productId)) return false;
  if (!item.canStack && pkg.items.some((existing) => existing.productId !== item.productId)) return false;
  if (pkg.items.some((existing) => existing.productId !== item.productId && existing.canStack === false)) return false;
  if (pkg.productsWeightKg + item.weightKg + pkg.box.tareWeightKg > pkg.box.maxWeightKg) return false;
  if (pkg.usedVolumeCm3 + itemVolume(item) > usableVolume(pkg.box)) return false;
  if (item.packingGroup && pkg.items.some((existing) => existing.productId !== item.productId && existing.packingGroup && item.packingGroup !== existing.packingGroup)) return false;
  return true;
}

function findPlacement(pkg: OpenPackage, item: PackingItem): Placement | null {
  const orientations = getOrientations(item);
  const candidates = pkg.freeSpaces.flatMap((space) => orientations
    .filter((orientation) => orientation.length <= space.length && orientation.width <= space.width && orientation.height <= space.height)
    .map((orientation) => ({ space, orientation, waste: spaceVolume(space) - volume(orientation), dimensionSlack: dimensionSlack(space, orientation) })));
  if (!candidates.length) return null;
  candidates.sort((left, right) => left.waste - right.waste || left.dimensionSlack - right.dimensionSlack);
  return candidates[0];
}

function createOpenPackage(box: PackingBox): OpenPackage {
  return {
    box,
    items: [],
    freeSpaces: [{ x: 0, y: 0, z: 0, length: box.internalLengthCm, width: box.internalWidthCm, height: box.internalHeightCm }],
    usedVolumeCm3: 0,
    productsWeightKg: 0,
  };
}

function placeItem(pkg: OpenPackage, item: PackingItem, knownPlacement?: Placement) {
  const placement = knownPlacement ?? findPlacement(pkg, item);
  if (!placement) return false;
  const placed: PackedItem = {
    lineId: item.lineId,
    productId: item.productId,
    sku: item.sku,
    productName: item.productName,
    unitIndex: item.unitIndex,
    weightKg: item.weightKg,
    canStack: item.canStack,
    shipAlone: item.shipAlone,
    fragile: item.fragile,
    packingGroup: item.packingGroup,
    position: { x: placement.space.x, y: placement.space.y, z: placement.space.z },
    orientation: placement.orientation,
  };
  if (pkg.items.some((existing) => overlaps(placed, existing))) return false;
  pkg.items.push(placed);
  pkg.productsWeightKg = round(pkg.productsWeightKg + item.weightKg, 3);
  pkg.usedVolumeCm3 = round(pkg.usedVolumeCm3 + volume(placement.orientation), 3);
  splitSpaces(pkg, placed);
  return true;
}

function splitSpaces(pkg: OpenPackage, placed: PackedItem) {
  const position = placed.position;
  const orientation = placed.orientation;
  if (!position || !orientation) return;
  const newSpaces: Space[] = [];
  for (const space of pkg.freeSpaces) {
    if (!boxOverlapsSpace(position, orientation, space)) {
      newSpaces.push(space);
      continue;
    }
    const right = {
      x: position.x + orientation.length,
      y: space.y,
      z: space.z,
      length: space.x + space.length - (position.x + orientation.length),
      width: space.width,
      height: space.height,
    };
    const top = {
      x: space.x,
      y: position.y + orientation.width,
      z: space.z,
      length: space.length,
      width: space.y + space.width - (position.y + orientation.width),
      height: space.height,
    };
    const front = {
      x: space.x,
      y: space.y,
      z: position.z + orientation.height,
      length: space.length,
      width: space.width,
      height: space.z + space.height - (position.z + orientation.height),
    };
    newSpaces.push(...[right, top, front].filter(isUsefulSpace));
  }
  pkg.freeSpaces = pruneSpaces(newSpaces, pkg.box);
}

function toPlan(strategy: PackingStrategy, openPackages: OpenPackage[], warnings: string[], lowerBound: number): PackingPlan {
  const packages = openPackages.map(toPackedPackage);
  const validationWarnings = validatePackedQuantities(packages);
  const estimatedVolumetricWeightKg = round(packages.reduce((total, item) => total + volumetricWeightFromExternalDimensions(item), 0), 3);
  const estimatedBillableWeightKg = round(packages.reduce((total, item) => total + Math.max(item.actualWeightKg, volumetricWeightFromExternalDimensions(item)), 0), 3);
  const totalActualWeightKg = round(packages.reduce((total, item) => total + item.actualWeightKg, 0), 3);
  const averageUtilizationPercent = round(packages.reduce((total, item) => total + item.utilizationPercent, 0) / Math.max(packages.length, 1), 1);
  const allWarnings = uniqueTexts([...warnings, ...validationWarnings]);
  const plan: PackingPlan = {
    id: `${strategy}-${signature(packages)}`,
    strategy,
    packages,
    totalPackages: packages.length,
    totalActualWeightKg,
    estimatedVolumetricWeightKg,
    estimatedBillableWeightKg,
    averageUtilizationPercent,
    valid: allWarnings.length === 0 && packages.length >= lowerBound && packages.length > 0,
    warnings: allWarnings,
  };
  return { ...plan, score: scorePlan(plan) };
}

function selectTopPlans(plans: PackingPlan[]) {
  const deduped = dedupePlans(plans);
  const valid = deduped.filter((plan) => plan.valid);
  if (!valid.length) return deduped.length ? deduped.slice(0, 1) : [invalidPlan('sin-solucion', 'ANCHOR_BALANCED', ['No fue posible calcular una solución de embalaje válida.'])];
  const pareto = paretoFilter(valid).sort((left, right) => (left.score ?? scorePlan(left)) - (right.score ?? scorePlan(right)));
  const separate = valid.find((plan) => plan.strategy === 'SEPARATE_EACH_UNIT');
  const sameBoxAlternatives = valid
    .filter((plan) => plan.strategy === 'SAME_BOX_TYPE')
    .sort((left, right) => (left.score ?? scorePlan(left)) - (right.score ?? scorePlan(right)))
    .slice(0, 3);
  const reservedSlots = sameBoxAlternatives.length + (separate ? 1 : 0);
  const regularLimit = Math.max(1, TOP_PACKING_PLANS - reservedSlots);
  const top = pareto
    .filter((plan) => plan.strategy !== 'SEPARATE_EACH_UNIT' && plan.strategy !== 'SAME_BOX_TYPE')
    .slice(0, regularLimit);
  top.push(...sameBoxAlternatives);
  if (separate) top.push(separate);
  return dedupePlans(top)
    .sort((left, right) => (left.score ?? scorePlan(left)) - (right.score ?? scorePlan(right)))
    .sort((left, right) => Number(left.strategy === 'SEPARATE_EACH_UNIT') - Number(right.strategy === 'SEPARATE_EACH_UNIT'));
}

function paretoFilter(plans: PackingPlan[]) {
  return plans.filter((plan) => !plans.some((other) => (
    other.id !== plan.id &&
    other.totalPackages <= plan.totalPackages &&
    other.estimatedBillableWeightKg <= plan.estimatedBillableWeightKg &&
    emptyVolumePercent(other) <= emptyVolumePercent(plan) &&
    boxCost(other) <= boxCost(plan) &&
    (
      other.totalPackages < plan.totalPackages ||
      other.estimatedBillableWeightKg < plan.estimatedBillableWeightKg ||
      emptyVolumePercent(other) < emptyVolumePercent(plan) ||
      boxCost(other) < boxCost(plan)
    )
  )));
}

function scorePlan(plan: PackingPlan) {
  const emptyVolume = emptyVolumePercent(plan);
  const boxCosts = boxCost(plan);
  const oversizeRisk = plan.packages.reduce((total, pkg) => total + (Math.max(pkg.externalLengthCm, pkg.externalWidthCm, pkg.externalHeightCm) >= 100 ? 1 : 0), 0);
  return round(
    plan.estimatedBillableWeightKg * 100 +
      plan.totalPackages * 18 +
      emptyVolume * 28 +
      boxCosts * 0.2 +
      oversizeRisk * 35 -
      plan.averageUtilizationPercent * 0.35,
    3,
  );
}

function normalizeBox(packageType: ShippingPackageType): PackingBox | null {
  const internalLengthCm = numberOrNull(packageType.internal_length) ?? numberOrNull(packageType.length);
  const internalWidthCm = numberOrNull(packageType.internal_width) ?? numberOrNull(packageType.width);
  const internalHeightCm = numberOrNull(packageType.internal_height) ?? numberOrNull(packageType.height);
  const externalLengthCm = numberOrNull(packageType.external_length) ?? numberOrNull(packageType.length);
  const externalWidthCm = numberOrNull(packageType.external_width) ?? numberOrNull(packageType.width);
  const externalHeightCm = numberOrNull(packageType.external_height) ?? numberOrNull(packageType.height);
  const tareWeightKg = numberOrNull(packageType.empty_weight);
  const maxWeightKg = numberOrNull(packageType.max_weight);
  if (![internalLengthCm, internalWidthCm, internalHeightCm, externalLengthCm, externalWidthCm, externalHeightCm, tareWeightKg, maxWeightKg].every((value) => value !== null && value >= 0)) {
    return null;
  }
  if (!internalLengthCm || !internalWidthCm || !internalHeightCm || !externalLengthCm || !externalWidthCm || !externalHeightCm || !maxWeightKg) return null;
  return {
    id: packageType.id,
    name: packageType.name,
    internalLengthCm,
    internalWidthCm,
    internalHeightCm,
    externalLengthCm,
    externalWidthCm,
    externalHeightCm,
    tareWeightKg: tareWeightKg ?? 0,
    maxWeightKg,
    maxFillPercent: clamp(numberOrNull(packageType.max_fill_percent) ?? 100, 1, 100),
    boxCost: numberOrNull(packageType.box_cost) ?? 0,
  };
}

function toPackedPackage(pkg: OpenPackage, index: number): PackedPackage {
  const usableVolumeCm3 = usableVolume(pkg.box);
  return {
    id: `${pkg.box.id}-${index + 1}-${pkg.items.map((item) => `${item.productId}.${item.unitIndex}`).join('.')}`,
    packageIndex: index + 1,
    packagingId: pkg.box.id,
    packagingName: pkg.box.name,
    externalLengthCm: pkg.box.externalLengthCm,
    externalWidthCm: pkg.box.externalWidthCm,
    externalHeightCm: pkg.box.externalHeightCm,
    productsWeightKg: round(pkg.productsWeightKg, 3),
    tareWeightKg: round(pkg.box.tareWeightKg, 3),
    actualWeightKg: round(pkg.productsWeightKg + pkg.box.tareWeightKg, 3),
    maxWeightKg: pkg.box.maxWeightKg,
    usedVolumeCm3: round(pkg.usedVolumeCm3, 3),
    usableVolumeCm3,
    utilizationPercent: round((pkg.usedVolumeCm3 / Math.max(usableVolumeCm3, 1)) * 100, 1),
    items: pkg.items,
  };
}

function getOrientations(item: Pick<PackingItem, 'lengthCm' | 'widthCm' | 'heightCm' | 'canRotate'>): Orientation[] {
  const values = item.canRotate
    ? [
        [item.lengthCm, item.widthCm, item.heightCm],
        [item.lengthCm, item.heightCm, item.widthCm],
        [item.widthCm, item.lengthCm, item.heightCm],
        [item.widthCm, item.heightCm, item.lengthCm],
        [item.heightCm, item.lengthCm, item.widthCm],
        [item.heightCm, item.widthCm, item.lengthCm],
      ]
    : [[item.lengthCm, item.widthCm, item.heightCm]];
  const seen = new Set<string>();
  return values
    .map(([length, width, height]) => ({ length, width, height }))
    .filter((orientation) => {
      const key = `${orientation.length}:${orientation.width}:${orientation.height}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function dedupePlans(plans: PackingPlan[]) {
  const seen = new Set<string>();
  return plans.filter((plan) => {
    const planFamily = plan.strategy === 'SEPARATE_EACH_UNIT' || plan.strategy === 'SAME_BOX_TYPE'
      ? `${plan.strategy}:${plan.variantName ?? ''}`
      : 'PACKING';
    const key = `${planFamily}:${signature(plan.packages)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function signature(packages: PackedPackage[]) {
  return packages
    .map((pkg) => `${pkg.packagingId}:${pkg.items.map((item) => `${item.productId}.${item.unitIndex}`).sort().join(',')}`)
    .sort()
    .join('|');
}

function validatePackedQuantities(packages: PackedPackage[]) {
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const item of packages.flatMap((pkg) => pkg.items)) {
    const key = `${item.lineId}:${item.productId}:${item.unitIndex}`;
    if (seen.has(key)) warnings.push(`${item.productName}: unidad duplicada en el embalaje.`);
    seen.add(key);
  }
  return warnings;
}

function invalidPlan(id: string, strategy: PackingStrategy, warnings: string[]): PackingPlan {
  return {
    id,
    strategy,
    packages: [],
    totalPackages: 0,
    totalActualWeightKg: 0,
    estimatedVolumetricWeightKg: 0,
    estimatedBillableWeightKg: 0,
    averageUtilizationPercent: 0,
    valid: false,
    warnings,
    score: Number.POSITIVE_INFINITY,
  };
}

function toPackingItem(item: PackedItem): PackingItem {
  const orientation = item.orientation;
  return {
    lineId: item.lineId,
    productId: item.productId,
    sku: item.sku,
    productName: item.productName,
    unitIndex: item.unitIndex,
    lengthCm: orientation?.length ?? 0,
    widthCm: orientation?.width ?? 0,
    heightCm: orientation?.height ?? 0,
    weightKg: item.weightKg,
    canRotate: true,
    canStack: item.canStack !== false,
    shipAlone: item.shipAlone === true,
    fragile: item.fragile === true,
    packingGroup: item.packingGroup ?? null,
  };
}

function overlaps(left: PackedItem, right: PackedItem) {
  if (!left.position || !left.orientation || !right.position || !right.orientation) return false;
  return rangesOverlap(left.position.x, left.position.x + left.orientation.length, right.position.x, right.position.x + right.orientation.length) &&
    rangesOverlap(left.position.y, left.position.y + left.orientation.width, right.position.y, right.position.y + right.orientation.width) &&
    rangesOverlap(left.position.z, left.position.z + left.orientation.height, right.position.z, right.position.z + right.orientation.height);
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function boxOverlapsSpace(position: { x: number; y: number; z: number }, orientation: Orientation, space: Space) {
  return rangesOverlap(position.x, position.x + orientation.length, space.x, space.x + space.length) &&
    rangesOverlap(position.y, position.y + orientation.width, space.y, space.y + space.width) &&
    rangesOverlap(position.z, position.z + orientation.height, space.z, space.z + space.height);
}

function isUsefulSpace(space: Space) {
  return space.length > 0.001 && space.width > 0.001 && space.height > 0.001;
}

function pruneSpaces(spaces: Space[], box: PackingBox) {
  return spaces
    .filter((space) => isUsefulSpace(space) && space.x >= 0 && space.y >= 0 && space.z >= 0)
    .filter((space) => space.x + space.length <= box.internalLengthCm + 0.001 && space.y + space.width <= box.internalWidthCm + 0.001 && space.z + space.height <= box.internalHeightCm + 0.001)
    .filter((space, index, source) => !source.some((other, otherIndex) => otherIndex !== index && containsSpace(other, space)))
    .sort((left, right) => left.z - right.z || left.y - right.y || left.x - right.x || spaceVolume(left) - spaceVolume(right))
    .slice(0, 80);
}

function containsSpace(container: Space, inner: Space) {
  return container.x <= inner.x &&
    container.y <= inner.y &&
    container.z <= inner.z &&
    container.x + container.length >= inner.x + inner.length &&
    container.y + container.width >= inner.y + inner.width &&
    container.z + container.height >= inner.z + inner.height;
}

function fits(box: PackingBox, orientation: Orientation) {
  return orientation.length <= box.internalLengthCm && orientation.width <= box.internalWidthCm && orientation.height <= box.internalHeightCm;
}

function usableVolume(box: PackingBox) {
  return box.internalLengthCm * box.internalWidthCm * box.internalHeightCm * (box.maxFillPercent / 100);
}

function itemVolume(item: Pick<PackingItem, 'lengthCm' | 'widthCm' | 'heightCm'>) {
  return item.lengthCm * item.widthCm * item.heightCm;
}

function boxVolume(box: PackingBox) {
  return box.internalLengthCm * box.internalWidthCm * box.internalHeightCm;
}

function externalVolumetricWeight(box: PackingBox) {
  return (Math.ceil(box.externalLengthCm) * Math.ceil(box.externalWidthCm) * Math.ceil(box.externalHeightCm)) / 5000;
}

function volumetricWeightFromExternalDimensions(pkg: PackedPackage) {
  return round((Math.ceil(pkg.externalLengthCm) * Math.ceil(pkg.externalWidthCm) * Math.ceil(pkg.externalHeightCm)) / 5000, 3);
}

function emptyVolumePercent(plan: PackingPlan) {
  const totalUsable = plan.packages.reduce((total, item) => total + item.usableVolumeCm3, 0);
  const totalUsed = plan.packages.reduce((total, item) => total + item.usedVolumeCm3, 0);
  if (!totalUsable) return 100;
  return round(((totalUsable - totalUsed) / totalUsable) * 100, 2);
}

function boxCost(plan: PackingPlan) {
  return plan.packages.length;
}

function dimensionSlack(space: Space, orientation: Orientation) {
  return (space.length - orientation.length) + (space.width - orientation.width) + (space.height - orientation.height);
}

function spaceVolume(space: Space) {
  return space.length * space.width * space.height;
}

function volume(orientation: Orientation) {
  return orientation.length * orientation.width * orientation.height;
}

function seededNoise(item: PackingItem, seed: number) {
  if (!seed) return 0;
  const raw = Math.sin((item.productId * 92821 + item.unitIndex * 68917 + seed * 19391) % 100000) * 10000;
  return (raw - Math.floor(raw)) * 500;
}

function groupKey(group: ProductGroup) {
  return `${group.productId}:${group.sku}:${group.volumeCm3}:${group.weightKg}`;
}

function isBetterPlan(candidate: PackingPlan, current: PackingPlan) {
  if (!candidate.valid) return false;
  return candidate.totalPackages < current.totalPackages ||
    (candidate.totalPackages === current.totalPackages && candidate.estimatedBillableWeightKg < current.estimatedBillableWeightKg - 0.001) ||
    (candidate.totalPackages === current.totalPackages && candidate.estimatedBillableWeightKg === current.estimatedBillableWeightKg && candidate.averageUtilizationPercent > current.averageUtilizationPercent);
}

function formatStrategyText(strategy: PackingStrategy) {
  const labels: Record<PackingStrategy, string> = {
    ANCHOR_BALANCED: 'productos grandes primero y balance peso-volumen',
    DIMENSIONAL_WEIGHT: 'menor peso dimensional estimado',
    BEST_VOLUME_UTILIZATION: 'mejor ocupación interna',
    SMALLEST_BOX_FIRST: 'cajas compactas',
    SAME_BOX_TYPE: 'un mismo tipo de embalaje lleno por capacidad',
    WEIGHT_FIRST: 'peso físico',
    MIN_PACKAGES: 'menor número de paquetes',
    SEPARATE_EACH_UNIT: 'cada pieza por separado',
  };
  return labels[strategy] ?? strategy;
}

function safeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'embalaje';
}

function performanceNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPositive(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function uniqueTexts(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
