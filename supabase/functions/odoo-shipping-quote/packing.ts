export type ShippingMode =
  | 'FACTORY_PACKAGE'
  | 'LOOSE_ITEM'
  | 'MASTER_CARTON'
  | 'SHIP_SEPARATELY';

export type ProductShippingProfile = {
  productId: string;
  sku: string;
  productName: string;
  unitWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  shippingMode: ShippingMode;
  packedWeightKg?: number | null;
  packedLengthCm?: number | null;
  packedWidthCm?: number | null;
  packedHeightCm?: number | null;
  unitsPerMasterCarton?: number | null;
  canRotate: boolean;
  stackable: boolean;
  fragile: boolean;
  canCombine: boolean;
  productFamily?: string | null;
  packagingGroup?: string | null;
  maxUnitsPerPackage?: number | null;
};

export type ShippingBox = {
  id: string;
  name: string;
  innerLengthCm: number;
  innerWidthCm: number;
  innerHeightCm: number;
  outerLengthCm: number;
  outerWidthCm: number;
  outerHeightCm: number;
  emptyWeightKg: number;
  paddingWeightKg: number;
  maxWeightKg: number;
  enabled: boolean;
};

export type PackingLine = {
  lineId: number;
  productId: string;
  sku: string;
  productName: string;
  description: string;
  quantity: number;
  profile: ProductShippingProfile;
};

export type PackedItem = {
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitWeightKg: number;
};

export type FinalPackage = {
  packageNumber: number;
  packageType: 'FACTORY_PACKAGE' | 'CUSTOM_BOX';
  boxId?: string;
  boxName?: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  productsWeightKg: number;
  boxWeightKg: number;
  paddingWeightKg: number;
  actualWeightKg: number;
  dimensionalWeightKg: number;
  estimatedBillableWeightKg: number;
  items: PackedItem[];
  warnings: string[];
};

export type PackingResult = {
  packages: FinalPackage[];
  warnings: string[];
  errors: string[];
  signature: string;
};

type UnitItem = {
  productId: string;
  sku: string;
  productName: string;
  unitWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  canRotate: boolean;
  stackable: boolean;
  fragile: boolean;
  canCombine: boolean;
  productFamily?: string | null;
  packagingGroup?: string | null;
  sourceLineId: number;
};

type OpenBox = {
  box: ShippingBox;
  items: UnitItem[];
  usedWeightKg: number;
  usedVolumeCm3: number;
  warnings: string[];
};

const dimensionalDivisor = 5000;

export function buildShippingPackages(lines: PackingLine[], boxes: ShippingBox[]): PackingResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const packages: FinalPackage[] = [];
  const enabledBoxes = boxes
    .filter((box) => box.enabled)
    .sort((left, right) => boxVolume(left) - boxVolume(right));
  const looseUnits: UnitItem[] = [];

  for (const line of lines) {
    const validation = validatePackingLine(line);
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);
    if (validation.errors.length) continue;

    const wholeQuantity = Math.floor(line.quantity);
    if (wholeQuantity !== line.quantity) {
      errors.push(`${line.productName}: la cantidad debe ser entera para calcular paquetes físicos.`);
      continue;
    }

    if (line.profile.shippingMode === 'FACTORY_PACKAGE' || line.profile.shippingMode === 'SHIP_SEPARATELY') {
      for (let index = 0; index < wholeQuantity; index += 1) {
        packages.push(buildFactoryPackage(line));
      }
      continue;
    }

    const unitsPerMasterCarton = line.profile.shippingMode === 'MASTER_CARTON'
      ? positiveInteger(line.profile.unitsPerMasterCarton)
      : null;
    if (unitsPerMasterCarton && unitsPerMasterCarton > 1) {
      let remaining = wholeQuantity;
      while (remaining >= unitsPerMasterCarton) {
        packages.push(buildMasterCartonPackage(line, unitsPerMasterCarton));
        remaining -= unitsPerMasterCarton;
      }
      for (let index = 0; index < remaining; index += 1) {
        looseUnits.push(unitFromLine(line));
      }
      continue;
    }

    for (let index = 0; index < wholeQuantity; index += 1) {
      looseUnits.push(unitFromLine(line));
    }
  }

  if (looseUnits.length && !enabledBoxes.length) {
    errors.push('No hay cajas activas para productos combinables.');
  }

  const openBoxes: OpenBox[] = [];
  const sortedUnits = looseUnits.sort((left, right) => difficultyScore(right) - difficultyScore(left));

  for (const unit of sortedUnits) {
    const opened = openBoxes
      .filter((candidate) => canPlaceInOpenBox(candidate, unit))
      .sort((left, right) => remainingBoxVolume(left) - remainingBoxVolume(right))[0];

    if (opened) {
      placeUnit(opened, unit);
      continue;
    }

    const newBox = enabledBoxes.find((box) => canPlaceInEmptyBox(box, unit));
    if (!newBox) {
      errors.push(`${unit.productName}: no cabe en ninguna caja activa o excede el peso máximo.`);
      continue;
    }

    const openBox: OpenBox = {
      box: newBox,
      items: [],
      usedWeightKg: 0,
      usedVolumeCm3: 0,
      warnings: [],
    };
    placeUnit(openBox, unit);
    openBoxes.push(openBox);
  }

  packages.push(...openBoxes.filter((box) => box.items.length).map(buildCustomBoxPackage));
  const numberedPackages = packages.map((pkg, index) => ({ ...pkg, packageNumber: index + 1 }));

  return {
    packages: numberedPackages,
    warnings: uniqueTexts([...warnings, ...numberedPackages.flatMap((pkg) => pkg.warnings)]),
    errors: uniqueTexts(errors),
    signature: buildPackagesSignature(numberedPackages),
  };
}

export function transformPackagesToFedexLineItems(packages: FinalPackage[]) {
  return packages.map((pkg) => ({
    groupPackageCount: 1,
    weight: {
      units: 'KG',
      value: round(Math.max(pkg.actualWeightKg, 0.01)),
    },
    dimensions: {
      length: roundDimension(pkg.lengthCm),
      width: roundDimension(pkg.widthCm),
      height: roundDimension(pkg.heightCm),
      units: 'CM',
    },
  }));
}

export function validateManualPackages(packages: FinalPackage[]) {
  const errors: string[] = [];
  if (!packages.length) errors.push('No hay paquetes para cotizar.');

  packages.forEach((pkg, index) => {
    const label = `Paquete ${index + 1}`;
    if (!pkg.items.length) errors.push(`${label}: no puede estar vacío.`);
    if (!isPositive(pkg.lengthCm) || !isPositive(pkg.widthCm) || !isPositive(pkg.heightCm)) {
      errors.push(`${label}: las dimensiones deben ser mayores a cero.`);
    }
    if (!isPositive(pkg.actualWeightKg)) errors.push(`${label}: el peso total debe ser mayor a cero.`);
  });

  return uniqueTexts(errors);
}

export function normalizeManualPackages(packages: FinalPackage[]) {
  return packages.map((pkg, index) => {
    const productsWeightKg = round(Math.max(0, Number(pkg.productsWeightKg) || 0));
    const boxWeightKg = round(Math.max(0, Number(pkg.boxWeightKg) || 0));
    const paddingWeightKg = round(Math.max(0, Number(pkg.paddingWeightKg) || 0));
    const lengthCm = round(Math.max(0, Number(pkg.lengthCm) || 0));
    const widthCm = round(Math.max(0, Number(pkg.widthCm) || 0));
    const heightCm = round(Math.max(0, Number(pkg.heightCm) || 0));
    const actualWeightKg = round(Math.max(Number(pkg.actualWeightKg) || 0, productsWeightKg + boxWeightKg + paddingWeightKg));
    const dimensionalWeightKg = round((lengthCm * widthCm * heightCm) / dimensionalDivisor);

    return {
      ...pkg,
      packageNumber: index + 1,
      lengthCm,
      widthCm,
      heightCm,
      productsWeightKg,
      boxWeightKg,
      paddingWeightKg,
      actualWeightKg,
      dimensionalWeightKg,
      estimatedBillableWeightKg: round(Math.max(actualWeightKg, dimensionalWeightKg)),
      items: pkg.items.filter((item) => item.quantity > 0),
      warnings: pkg.warnings ?? [],
    };
  });
}

function validatePackingLine(line: PackingLine) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const profile = line.profile;
  const packedWeight = profile.packedWeightKg ?? profile.unitWeightKg;
  const packedLength = profile.packedLengthCm ?? profile.lengthCm;
  const packedWidth = profile.packedWidthCm ?? profile.widthCm;
  const packedHeight = profile.packedHeightCm ?? profile.heightCm;

  if (!isPositive(line.quantity)) errors.push(`${line.productName}: cantidad inválida.`);
  if (!isPositive(profile.unitWeightKg)) errors.push(`${line.productName}: falta peso unitario.`);
  if (!isPositive(profile.lengthCm) || !isPositive(profile.widthCm) || !isPositive(profile.heightCm)) {
    errors.push(`${line.productName}: faltan dimensiones unitarias.`);
  }
  if (profile.shippingMode === 'FACTORY_PACKAGE' || profile.shippingMode === 'SHIP_SEPARATELY') {
    if (!isPositive(packedWeight)) errors.push(`${line.productName}: falta peso empacado.`);
    if (!isPositive(packedLength) || !isPositive(packedWidth) || !isPositive(packedHeight)) {
      errors.push(`${line.productName}: faltan dimensiones empacadas.`);
    }
  }
  if (profile.fragile && profile.stackable) {
    warnings.push(`${line.productName}: está marcado como frágil y apilable; se evitará combinarlo con productos incompatibles.`);
  }

  return { errors, warnings };
}

function buildFactoryPackage(line: PackingLine): FinalPackage {
  const profile = line.profile;
  const weight = profile.packedWeightKg ?? profile.unitWeightKg;
  const length = profile.packedLengthCm ?? profile.lengthCm;
  const width = profile.packedWidthCm ?? profile.widthCm;
  const height = profile.packedHeightCm ?? profile.heightCm;
  const dimensionalWeightKg = round((length * width * height) / dimensionalDivisor);
  const actualWeightKg = round(weight);

  return {
    packageNumber: 0,
    packageType: 'FACTORY_PACKAGE',
    lengthCm: round(length),
    widthCm: round(width),
    heightCm: round(height),
    productsWeightKg: actualWeightKg,
    boxWeightKg: 0,
    paddingWeightKg: 0,
    actualWeightKg,
    dimensionalWeightKg,
    estimatedBillableWeightKg: round(Math.max(actualWeightKg, dimensionalWeightKg)),
    items: [packedItemFromLine(line, 1)],
    warnings: [],
  };
}

function buildMasterCartonPackage(line: PackingLine, quantity: number): FinalPackage {
  const profile = line.profile;
  const weight = profile.packedWeightKg ?? profile.unitWeightKg * quantity;
  const length = profile.packedLengthCm ?? profile.lengthCm;
  const width = profile.packedWidthCm ?? profile.widthCm;
  const height = profile.packedHeightCm ?? profile.heightCm;
  const dimensionalWeightKg = round((length * width * height) / dimensionalDivisor);
  const actualWeightKg = round(weight);

  return {
    packageNumber: 0,
    packageType: 'FACTORY_PACKAGE',
    lengthCm: round(length),
    widthCm: round(width),
    heightCm: round(height),
    productsWeightKg: actualWeightKg,
    boxWeightKg: 0,
    paddingWeightKg: 0,
    actualWeightKg,
    dimensionalWeightKg,
    estimatedBillableWeightKg: round(Math.max(actualWeightKg, dimensionalWeightKg)),
    items: [packedItemFromLine(line, quantity)],
    warnings: [],
  };
}

function buildCustomBoxPackage(openBox: OpenBox): FinalPackage {
  const productsWeightKg = round(openBox.usedWeightKg);
  const actualWeightKg = round(productsWeightKg + openBox.box.emptyWeightKg + openBox.box.paddingWeightKg);
  const dimensionalWeightKg = round(
    (openBox.box.outerLengthCm * openBox.box.outerWidthCm * openBox.box.outerHeightCm) / dimensionalDivisor,
  );

  return {
    packageNumber: 0,
    packageType: 'CUSTOM_BOX',
    boxId: openBox.box.id,
    boxName: openBox.box.name,
    lengthCm: round(openBox.box.outerLengthCm),
    widthCm: round(openBox.box.outerWidthCm),
    heightCm: round(openBox.box.outerHeightCm),
    productsWeightKg,
    boxWeightKg: round(openBox.box.emptyWeightKg),
    paddingWeightKg: round(openBox.box.paddingWeightKg),
    actualWeightKg,
    dimensionalWeightKg,
    estimatedBillableWeightKg: round(Math.max(actualWeightKg, dimensionalWeightKg)),
    items: mergePackedItems(openBox.items.map((item) => ({
      productId: item.productId,
      sku: item.sku,
      productName: item.productName,
      quantity: 1,
      unitWeightKg: item.unitWeightKg,
    }))),
    warnings: openBox.warnings,
  };
}

function unitFromLine(line: PackingLine): UnitItem {
  return {
    productId: line.productId,
    sku: line.sku,
    productName: line.productName,
    unitWeightKg: line.profile.unitWeightKg,
    lengthCm: line.profile.lengthCm,
    widthCm: line.profile.widthCm,
    heightCm: line.profile.heightCm,
    canRotate: line.profile.canRotate,
    stackable: line.profile.stackable,
    fragile: line.profile.fragile,
    canCombine: line.profile.canCombine,
    productFamily: line.profile.productFamily,
    packagingGroup: line.profile.packagingGroup,
    sourceLineId: line.lineId,
  };
}

function packedItemFromLine(line: PackingLine, quantity: number): PackedItem {
  return {
    productId: line.productId,
    sku: line.sku,
    productName: line.productName,
    quantity,
    unitWeightKg: round(line.profile.unitWeightKg),
  };
}

function canPlaceInOpenBox(openBox: OpenBox, unit: UnitItem) {
  if (!unit.canCombine) return false;
  if (unit.fragile && openBox.items.some((item) => item.productId !== unit.productId)) return false;
  if (openBox.items.some((item) => item.fragile && item.productId !== unit.productId)) return false;
  if (!unit.stackable && openBox.items.some((item) => item.productId !== unit.productId)) return false;
  if (
    openBox.items.some((item) =>
      item.packagingGroup &&
      unit.packagingGroup &&
      item.packagingGroup !== unit.packagingGroup,
    )
  ) {
    return false;
  }
  if (openBox.usedWeightKg + unit.unitWeightKg + openBox.box.emptyWeightKg + openBox.box.paddingWeightKg > openBox.box.maxWeightKg) {
    return false;
  }
  if (!fitsDimensions(openBox.box, unit)) return false;
  return openBox.usedVolumeCm3 + unitVolume(unit) <= innerBoxVolume(openBox.box);
}

function canPlaceInEmptyBox(box: ShippingBox, unit: UnitItem) {
  return (
    fitsDimensions(box, unit) &&
    unit.unitWeightKg + box.emptyWeightKg + box.paddingWeightKg <= box.maxWeightKg &&
    unitVolume(unit) <= innerBoxVolume(box)
  );
}

function placeUnit(openBox: OpenBox, unit: UnitItem) {
  openBox.items.push(unit);
  openBox.usedWeightKg = round(openBox.usedWeightKg + unit.unitWeightKg);
  openBox.usedVolumeCm3 = round(openBox.usedVolumeCm3 + unitVolume(unit));
}

function fitsDimensions(box: ShippingBox, unit: UnitItem) {
  const orientations = unit.canRotate ? getOrientations(unit) : [[unit.lengthCm, unit.widthCm, unit.heightCm]];
  return orientations.some(([length, width, height]) =>
    length <= box.innerLengthCm && width <= box.innerWidthCm && height <= box.innerHeightCm,
  );
}

function getOrientations(unit: UnitItem) {
  const dimensions = [unit.lengthCm, unit.widthCm, unit.heightCm];
  return [
    [dimensions[0], dimensions[1], dimensions[2]],
    [dimensions[0], dimensions[2], dimensions[1]],
    [dimensions[1], dimensions[0], dimensions[2]],
    [dimensions[1], dimensions[2], dimensions[0]],
    [dimensions[2], dimensions[0], dimensions[1]],
    [dimensions[2], dimensions[1], dimensions[0]],
  ];
}

function difficultyScore(unit: UnitItem) {
  return unitVolume(unit) + unit.unitWeightKg * 1000 + Math.max(unit.lengthCm, unit.widthCm, unit.heightCm) * 100;
}

function unitVolume(unit: UnitItem) {
  return unit.lengthCm * unit.widthCm * unit.heightCm;
}

function boxVolume(box: ShippingBox) {
  return box.outerLengthCm * box.outerWidthCm * box.outerHeightCm;
}

function innerBoxVolume(box: ShippingBox) {
  return box.innerLengthCm * box.innerWidthCm * box.innerHeightCm;
}

function remainingBoxVolume(openBox: OpenBox) {
  return innerBoxVolume(openBox.box) - openBox.usedVolumeCm3;
}

function mergePackedItems(items: PackedItem[]) {
  const map = new Map<string, PackedItem>();
  for (const item of items) {
    const key = `${item.productId}:${item.sku}`;
    const current = map.get(key);
    if (current) {
      current.quantity += item.quantity;
    } else {
      map.set(key, { ...item });
    }
  }
  return [...map.values()].sort((left, right) => left.productName.localeCompare(right.productName));
}

function buildPackagesSignature(packages: FinalPackage[]) {
  return packages
    .map((pkg) => [
      pkg.packageType,
      pkg.boxId ?? '',
      pkg.lengthCm,
      pkg.widthCm,
      pkg.heightCm,
      pkg.actualWeightKg,
      pkg.items.map((item) => `${item.productId}:${item.quantity}`).join(','),
    ].join('|'))
    .join('||');
}

function positiveInteger(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isPositive(value: number | null | undefined) {
  return Number.isFinite(value) && Number(value) > 0;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function roundDimension(value: number) {
  return Math.max(1, Math.ceil(value));
}

function uniqueTexts(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
