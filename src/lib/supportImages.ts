import { supabase } from './supabase';
import type { SupportImage } from './types';

const SUPPORT_FILE_BUCKET = 'support-images';
const MAX_IMAGE_WIDTH = 500;
const MAX_IMAGE_BYTES = 950 * 1024;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const WEBP_QUALITIES = [0.76, 0.68, 0.58, 0.48, 0.38];

export const MAX_SUPPORT_IMAGES = 4;
export const MAX_SUPPORT_PDFS = 4;
export const ACCEPTED_SUPPORT_IMAGE_TYPES = ['image/png', 'image/jpeg'];
export const ACCEPTED_SUPPORT_PDF_TYPES = ['application/pdf'];
export const ACCEPTED_SUPPORT_FILE_TYPES = [...ACCEPTED_SUPPORT_IMAGE_TYPES, ...ACCEPTED_SUPPORT_PDF_TYPES];

export type PreparedSupportFile = {
  blob: Blob;
  originalName: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  fileName: string;
  mimeType: 'image/webp' | 'application/pdf';
};

export function getSupportImageUrl(image: SupportImage) {
  return getSupportFileUrl(image);
}

export function getSupportFileUrl(file: SupportImage) {
  return getSupportFileUrlFromPath(file.storage_path);
}

export function getSupportFileUrlFromPath(storagePath: string) {
  return supabase.storage.from(SUPPORT_FILE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export function isAcceptedSupportImage(file: File) {
  return ACCEPTED_SUPPORT_IMAGE_TYPES.includes(file.type);
}

export function isAcceptedSupportFile(file: File) {
  return ACCEPTED_SUPPORT_FILE_TYPES.includes(file.type);
}

export function isSupportPdf(file: Pick<SupportImage, 'mime_type' | 'original_name'>) {
  return file.mime_type === 'application/pdf' || file.original_name?.toLowerCase().endsWith('.pdf');
}

export async function prepareSupportImages(files: File[]) {
  return prepareSupportFiles(files);
}

export async function prepareSupportFiles(files: File[]) {
  const prepared: PreparedSupportFile[] = [];

  for (const file of files) {
    if (!isAcceptedSupportFile(file)) {
      throw new Error('Solo se permiten imágenes PNG, JPG o archivos PDF.');
    }

    prepared.push(file.type === 'application/pdf' ? preparePdf(file) : await convertImageToWebp(file));
  }

  return prepared;
}

function preparePdf(file: File): PreparedSupportFile {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('Cada PDF debe pesar máximo 5 MB.');
  }

  return {
    blob: file,
    originalName: file.name,
    width: null,
    height: null,
    sizeBytes: file.size,
    fileName: `${sanitizeFileName(file.name)}.pdf`,
    mimeType: 'application/pdf',
  };
}

async function convertImageToWebp(file: File): Promise<PreparedSupportFile> {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_WIDTH / image.width);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    image.close();
    throw new Error('No se pudo preparar la imagen.');
  }

  context.drawImage(image, 0, 0, width, height);
  image.close();

  let blob: Blob | null = null;
  for (const quality of WEBP_QUALITIES) {
    blob = await canvasToBlob(canvas, quality);
    if (blob.size <= MAX_IMAGE_BYTES) break;
  }

  if (!blob) {
    throw new Error('No se pudo convertir la imagen a WebP.');
  }

  return {
    blob,
    originalName: file.name,
    width,
    height,
    sizeBytes: blob.size,
    fileName: `${sanitizeFileName(file.name)}.webp`,
    mimeType: 'image/webp',
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No se pudo convertir la imagen a WebP.'));
          return;
        }
        resolve(blob);
      },
      'image/webp',
      quality,
    );
  });
}

function sanitizeFileName(name: string) {
  const baseName = name.replace(/\.[^.]+$/, '');
  return (
    baseName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'imagen'
  );
}
