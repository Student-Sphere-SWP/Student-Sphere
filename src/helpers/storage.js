const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'student-sphere-files';

/**
 * Upload a file buffer to Supabase Storage.
 *
 * @param {Buffer} buffer        – File content
 * @param {string} originalName  – Original filename (used to determine extension)
 * @param {string} folder        – Subfolder within the bucket (e.g. 'pdfs', 'avatars')
 * @param {string} mimeType      – MIME type of the file
 * @returns {string}             – Public URL of the uploaded file
 */
async function uploadFile(buffer, originalName, folder, mimeType) {
  const ext      = path.extname(originalName) || '';
  const filename = `${folder}/${uuidv4()}${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType:  mimeType,
      upsert:       false
    });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

/**
 * Delete a file from Supabase Storage by its public URL.
 *
 * @param {string} publicUrl – The public URL returned by uploadFile
 */
async function deleteFile(publicUrl) {
  // Extract the storage path from the URL
  // URL format: https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
  try {
    const url   = new URL(publicUrl);
    const parts = url.pathname.split(`/object/public/${BUCKET}/`);
    if (parts.length < 2) return;
    const filePath = parts[1];
    await supabase.storage.from(BUCKET).remove([filePath]);
  } catch {
    // Non-critical — log but don't throw
    console.warn('Could not delete file from Supabase Storage:', publicUrl);
  }
}

module.exports = { uploadFile, deleteFile };

