const IMAGE_TYPES: Record<string, ReadonlySet<string>> = {
  'image/jpeg': new Set(['jpg', 'jpeg']),
  'image/png': new Set(['png']),
  'image/webp': new Set(['webp']),
}

export function validateImageUpload(file: File): string | null {
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
    return 'Image must be between 1 byte and 5MB'
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const extensions = IMAGE_TYPES[file.type.toLowerCase()]
  if (!extensions?.has(extension)) {
    return 'Image must be a JPEG, PNG, or WebP file with a matching extension'
  }
  return null
}
