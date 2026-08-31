import { describe, expect, it } from 'vitest'
import { validateImageUpload } from '../../src/lib/imageUpload'

describe('image upload validation', () => {
  it('accepts only matching image MIME types and extensions', () => {
    expect(validateImageUpload(new File(['image'], 'photo.jpg', { type: 'image/jpeg' }))).toBeNull()
    expect(validateImageUpload(new File(['image'], 'photo.webp', { type: 'image/webp' }))).toBeNull()
    expect(validateImageUpload(new File(['<script>'], 'photo.png', { type: 'text/html' }))).toMatch(/JPEG/)
    expect(validateImageUpload(new File(['image'], 'photo.svg', { type: 'image/svg+xml' }))).toMatch(/JPEG/)
    expect(validateImageUpload(new File(['image'], 'photo.jpg', { type: 'image/png' }))).toMatch(/matching/)
  })

  it('rejects empty and oversized files', () => {
    expect(validateImageUpload(new File([], 'empty.png', { type: 'image/png' }))).toMatch(/1 byte/)
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })
    expect(validateImageUpload(oversized)).toMatch(/5MB/)
  })
})
