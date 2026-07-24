/**
 * Escolher e preparar a foto do avatar.
 *
 * O dono escolhe da galeria ou tira na hora; reduzimos para 256x256 e
 * comprimimos ANTES de enviar (o servidor guarda uma imagem pequena). O app não
 * decide nada de negócio aqui — só prepara a imagem.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export interface FotoComprimida {
  base64: string;
  mime: string;
}

/** Reduz para 256px e comprime em JPEG, devolvendo base64. */
async function preparar(uri: string): Promise<FotoComprimida | null> {
  const r = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 256, height: 256 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  if (!r.base64) return null;
  return { base64: r.base64, mime: 'image/jpeg' };
}

/** Abre a galeria; retorna a foto pronta ou null (cancelou / sem permissão). */
export async function escolherDaGaleria(): Promise<FotoComprimida | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = res.canceled ? null : res.assets[0];
  return asset ? preparar(asset.uri) : null;
}

/** Abre a câmera; retorna a foto pronta ou null (cancelou / sem permissão). */
export async function tirarFoto(): Promise<FotoComprimida | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = res.canceled ? null : res.assets[0];
  return asset ? preparar(asset.uri) : null;
}
