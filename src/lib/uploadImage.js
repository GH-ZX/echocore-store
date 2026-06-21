import { supabase } from './supabase';

export async function uploadImage(file, prefix = 'product') {
  if (!file) return null;

  const fileExt = file.name.split('.').pop();
  const fileName = `${prefix}-${Date.now()}.${fileExt}`;

  const { error } = await supabase.storage
    .from('product-images')
    .upload(fileName, file, { upsert: true });

  if (error) {
    throw new Error(error.message || 'Image upload failed');
  }

  const { data: { publicUrl } } = supabase.storage
    .from('product-images')
    .getPublicUrl(fileName);

  return publicUrl;
}