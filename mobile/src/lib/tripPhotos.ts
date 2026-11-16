import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { UploadablePhoto } from '@/api/media';

/**
 * Trip photo capture for the plan editor. The server caps uploads at 8 MB and
 * stores the original; the long edge is reduced to 2000 px first so a phone
 * photo does not hog the trip's media budget or slow every later read.
 */

const MAX_EDGE = 2000;
const KEEP_UNDER_BYTES = 1.5 * 1024 * 1024;
const REENCODE_QUALITY = 0.85;

const LIBRARY_OFF =
  'Photo access is off. Turn it on in your device settings to choose a picture.';
const CAMERA_OFF =
  'Camera access is off. Turn it on in your device settings to take a photo.';

export type PhotoSource = 'camera' | 'library';

function extensionFor(mime?: string | null): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function pickerOptions(): ImagePicker.ImagePickerOptions {
  return { mediaTypes: ['images'], quality: 1, allowsEditing: false };
}

async function preparePickedPhoto(
  asset: ImagePicker.ImagePickerAsset
): Promise<UploadablePhoto> {
  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  const longEdge = Math.max(width, height);
  const mimeType = asset.mimeType || 'image/jpeg';

  // Files already small enough stay untouched, which keeps PNG/WebP crispness.
  if (longEdge > 0 && longEdge <= MAX_EDGE && (asset.fileSize ?? 0) <= KEEP_UNDER_BYTES) {
    return {
      uri: asset.uri,
      name: asset.fileName || `photo.${extensionFor(mimeType)}`,
      type: mimeType,
      width,
      height,
      file: asset.file,
    };
  }

  const context = ImageManipulator.manipulate(asset.uri);
  if (longEdge > MAX_EDGE) {
    if (width >= height) context.resize({ width: MAX_EDGE });
    else context.resize({ height: MAX_EDGE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: REENCODE_QUALITY });

  // On web the manipulator hands back a blob: URL; FormData needs the bytes.
  const file =
    Platform.OS === 'web' ? await (await fetch(saved.uri)).blob() : undefined;
  return {
    uri: saved.uri,
    name: 'photo.jpg',
    type: 'image/jpeg',
    width: saved.width,
    height: saved.height,
    file,
  };
}

/** Opens the camera or library and returns an upload-ready photo, or null if cancelled. */
export async function pickTripPhoto(source: PhotoSource): Promise<UploadablePhoto | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(source === 'camera' ? CAMERA_OFF : LIBRARY_OFF);
  }

  let result: ImagePicker.ImagePickerResult;
  try {
    result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(pickerOptions())
        : await ImagePicker.launchImageLibraryAsync(pickerOptions());
  } catch {
    throw new Error(
      source === 'camera'
        ? 'The camera couldn’t open. Try choosing a photo from your library instead.'
        : 'That photo couldn’t be opened. Try another one.'
    );
  }

  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return preparePickedPhoto(asset);
}
