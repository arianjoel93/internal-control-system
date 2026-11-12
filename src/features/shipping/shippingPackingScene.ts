import type { Dimensions, PackingPackage, Placement } from '../../../supabase/functions/_shared/shipping-packing';

export type ScenePoint = { x: number; y: number; z: number };
export type SceneItem = {
  id: string; label: string; center: ScenePoint; size: Dimensions;
  productKey: string;
  shape: 'box' | 'roll'; rollAxis: 'x' | 'y' | 'z'; closed: boolean;
};

export function placementToScene(item: Placement): SceneItem {
  const margin = Math.max(0, item.unit.protectionMarginCm ?? 0);
  const size = {
    length: Math.max(.001, item.orientation.length - 2 * margin),
    width: Math.max(.001, item.orientation.width - 2 * margin),
    height: Math.max(.001, item.orientation.height - 2 * margin),
  };
  const closed = item.unit.prepacked === true || !!item.unit.presentationQuantity;
  const shape = !closed && item.unit.physicalUnit === 'ROLLO' ? 'roll' : 'box';
  // The native roll axis is its height; rotations permute its reserved envelope.
  const axis = (['length', 'width', 'height'] as const).reduce((best, key) =>
    Math.abs(size[key] - item.unit.dimensions.height) < Math.abs(size[best] - item.unit.dimensions.height) ? key : best, 'height');
  return {
    id: item.unit.id, label: item.unit.productName, productKey: String(item.unit.productId || item.unit.sku || item.unit.id), size, closed, shape,
    rollAxis: axis === 'length' ? 'x' : axis === 'width' ? 'z' : 'y',
    center: { x: item.position.x + item.orientation.length / 2,
      y: item.position.z + item.orientation.height / 2, z: item.position.y + item.orientation.width / 2 },
  };
}

export function buildPackingScene(pkg: PackingPackage): SceneItem[] {
  return pkg.items.map(placementToScene);
}

export function packingProductColors(packages: PackingPackage[]) {
  const keys = [...new Set(packages.flatMap(pkg => pkg.items.map(item => String(item.unit.productId || item.unit.sku || item.unit.id))))].sort();
  return new Map(keys.map((key,index) => [key, `hsl(${Math.round((215 + index * 137.508) % 360)} 58% 55%)`]));
}


export function projectScenePoint(point: ScenePoint, yaw: number, pitch: number) {
  const x = point.x * Math.cos(yaw) - point.z * Math.sin(yaw);
  const z = point.x * Math.sin(yaw) + point.z * Math.cos(yaw);
  return { x, y: point.y * Math.cos(pitch) - z * Math.sin(pitch),
    depth: point.y * Math.sin(pitch) + z * Math.cos(pitch) };
}
