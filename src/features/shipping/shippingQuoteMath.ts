import type { ShippingDimensionUnit, ShippingPackageType, ShippingWeightInputMode, ShippingWeightUnit } from '../../lib/types';

export type ShippingPackageDraft = {
  id: string;
  packageTypeId?: string | null;
  name?: string | null;
  quantity: number;
  contentWeight: number;
  length: number;
  width: number;
  height: number;
  dimensionUnit: ShippingDimensionUnit;
  weightUnit: ShippingWeightUnit;
};

export type PreparedShippingPackage = {
  packageType: ShippingPackageType;
  packageIndex: number;
  contentWeight: number;
  tareWeight: number;
  actualWeight: number;
  volumetricWeight: number;
  billableWeight: number;
  weightUnit: ShippingWeightUnit;
  length: number;
  width: number;
  height: number;
  dimensionUnit: ShippingDimensionUnit;
};

export function convertWeight(value: number, from: ShippingWeightUnit, to: ShippingWeightUnit) {
  assertFinitePositive(value, 'peso');
  if (from === to) return round(value, 3);
  return round(from === 'KG' ? value * 2.2046226218 : value / 2.2046226218, 3);
}

export function convertDimension(value: number, from: ShippingDimensionUnit, to: ShippingDimensionUnit) {
  assertFinitePositive(value, 'dimensión');
  if (from === to) return round(value, 2);
  return round(from === 'CM' ? value / 2.54 : value * 2.54, 2);
}

export function preparePackages({
  drafts,
  packageTypes,
  weightInputMode,
}: {
  drafts: ShippingPackageDraft[];
  packageTypes: ShippingPackageType[];
  weightInputMode: ShippingWeightInputMode;
}) {
  const packages: PreparedShippingPackage[] = [];
  const errors: string[] = [];
  const packageById = new Map(packageTypes.map((item) => [item.id, item]));

  drafts.forEach((draft) => {
    const packageType = draft.packageTypeId ? packageById.get(draft.packageTypeId) : null;
    const quantity = Math.floor(Number(draft.quantity));
    const contentWeight = Number(draft.contentWeight);
    const length = Number(draft.length ?? packageType?.external_length ?? packageType?.length);
    const width = Number(draft.width ?? packageType?.external_width ?? packageType?.width);
    const height = Number(draft.height ?? packageType?.external_height ?? packageType?.height);
    const dimensionUnit = draft.dimensionUnit ?? packageType?.dimension_unit ?? 'CM';
    const weightUnit = draft.weightUnit ?? packageType?.weight_unit ?? 'KG';

    if (packageType && !packageType.is_active) {
      errors.push(`${packageType.name} no está activo.`);
      return;
    }
    if (!quantity || quantity < 1) {
      errors.push(`${draft.name || packageType?.name || 'Paquete'}: la cantidad debe ser mayor a cero.`);
      return;
    }
    if (!Number.isFinite(contentWeight) || contentWeight <= 0) {
      errors.push(`${draft.name || packageType?.name || 'Paquete'}: indica un peso válido.`);
      return;
    }
    if (![length, width, height].every((value) => Number.isFinite(value) && value > 0)) {
      errors.push(`${draft.name || packageType?.name || 'Paquete'}: indica largo, ancho y alto válidos.`);
      return;
    }
    if (packageType && !isConfiguredPackageType(packageType)) {
      errors.push(`${packageType.name}: faltan dimensiones, tara o peso máximo.`);
      return;
    }

    const tareWeight = packageType?.empty_weight ?? 0;
    const actualWeight =
      weightInputMode === 'NET_CONTENT' ? contentWeight + tareWeight : contentWeight;
    const volumetricWeight = calculateVolumetricWeight({
      length,
      width,
      height,
      external_length: length,
      external_width: width,
      external_height: height,
      dimension_unit: dimensionUnit,
      weight_unit: weightUnit,
    });
    const billableWeight = Math.max(actualWeight, volumetricWeight);
    const maxWeight = packageType?.max_weight ?? 0;

    if (maxWeight > 0 && actualWeight > maxWeight) {
      errors.push(`El peso de este paquete supera el máximo permitido para ${draft.name || packageType?.name || 'Paquete'}.`);
      return;
    }

    for (let index = 0; index < quantity; index += 1) {
      const resolvedPackageType: ShippingPackageType = packageType ?? {
        id: draft.id,
        carrier: 'FEDEX',
        name: draft.name || `Paquete ${packages.length + 1}`,
        internal_code: 'PRODUCTO_ORDEN',
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
        sort_order: packages.length + 1,
        fedex_packaging_type: 'YOUR_PACKAGING',
        created_at: '',
        updated_at: '',
      };
      packages.push({
        packageType: resolvedPackageType,
        packageIndex: packages.length + 1,
        contentWeight: round(contentWeight, 3),
        tareWeight: round(weightInputMode === 'NET_CONTENT' ? tareWeight : 0, 3),
        actualWeight: round(actualWeight, 3),
        volumetricWeight: round(volumetricWeight, 3),
        billableWeight: round(billableWeight, 3),
        weightUnit,
        length,
        width,
        height,
        dimensionUnit,
      });
    }
  });

  return { packages, errors };
}

export function isConfiguredPackageType(packageType: ShippingPackageType) {
  return Boolean(
    (packageType.external_length ?? packageType.length) &&
      (packageType.external_width ?? packageType.width) &&
      (packageType.external_height ?? packageType.height) &&
      packageType.empty_weight !== null &&
      packageType.empty_weight >= 0 &&
      (packageType.max_weight === null || packageType.max_weight >= 0),
  );
}

export function summarizePackages(packages: PreparedShippingPackage[]) {
  return {
    packageCount: packages.length,
    contentWeight: round(packages.reduce((total, item) => total + item.contentWeight, 0), 3),
    tareWeight: round(packages.reduce((total, item) => total + item.tareWeight, 0), 3),
    actualWeight: round(packages.reduce((total, item) => total + item.actualWeight, 0), 3),
    volumetricWeight: round(packages.reduce((total, item) => total + item.volumetricWeight, 0), 3),
    billableWeight: round(packages.reduce((total, item) => total + item.billableWeight, 0), 3),
  };
}

export function calculateVolumetricWeight(packageType: Pick<ShippingPackageType, 'length' | 'width' | 'height' | 'external_length' | 'external_width' | 'external_height' | 'dimension_unit' | 'weight_unit'>) {
  const source = packageType as Pick<ShippingPackageType, 'length' | 'width' | 'height' | 'external_length' | 'external_width' | 'external_height' | 'dimension_unit' | 'weight_unit'>;
  const length = Number(source.external_length ?? source.length);
  const width = Number(source.external_width ?? source.width);
  const height = Number(source.external_height ?? source.height);
  if (![length, width, height].every((value) => Number.isFinite(value) && value > 0)) return 0;

  if (packageType.dimension_unit === 'CM' && packageType.weight_unit === 'KG') {
    return round((Math.ceil(length) * Math.ceil(width) * Math.ceil(height)) / 5000, 3);
  }

  if (packageType.dimension_unit === 'IN' && packageType.weight_unit === 'LB') {
    return round((Math.ceil(length) * Math.ceil(width) * Math.ceil(height)) / 139, 3);
  }

  if (packageType.dimension_unit === 'IN' && packageType.weight_unit === 'KG') {
    return round((Math.ceil(length) * Math.ceil(width) * Math.ceil(height)) / 305, 3);
  }

  const lengthIn = Math.ceil(convertDimension(length, 'CM', 'IN'));
  const widthIn = Math.ceil(convertDimension(width, 'CM', 'IN'));
  const heightIn = Math.ceil(convertDimension(height, 'CM', 'IN'));
  return round((lengthIn * widthIn * heightIn) / 139, 3);
}

function assertFinitePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`El valor de ${label} debe ser mayor a cero.`);
  }
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
