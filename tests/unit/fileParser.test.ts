import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { IMPORT_LIMITS, parseFile } from '../../src/lib/parsers/fileParser'

/**
 * Covers the front door of the import: whatever spreadsheet a tenant uploads.
 *
 * A parsing mistake here is silent — the wizard shows a plausible preview and
 * the wrong values get written to real records — so the cases below lean on the
 * messy shapes real files have: blank columns, ragged rows, stray whitespace,
 * numbers and dates.
 */

function csvFile(name: string, contents: string): File {
  return new File([contents], name, { type: 'text/csv' })
}

function xlsxFile(name: string, grid: unknown[][]): File {
  const sheet = XLSX.utils.aoa_to_sheet(grid)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1')
  const out = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([out], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

describe('parseFile — CSV', () => {
  it('reads headers and rows', async () => {
    const result = await parseFile(
      csvFile('p.csv', 'Provider,Case Type\nDr Smith,Knee\nDr Jones,Hip\n'),
    )
    expect(result.errors).toEqual([])
    expect(result.headers).toEqual(['Provider', 'Case Type'])
    expect(result.rowCount).toBe(2)
    expect(result.rows[0]).toEqual({ Provider: 'Dr Smith', 'Case Type': 'Knee' })
  })

  it('trims whitespace from headers and cells', async () => {
    const result = await parseFile(
      csvFile('p.csv', '  Provider  ,  Case Type  \n  Dr Smith  ,  Knee  \n'),
    )
    expect(result.headers).toEqual(['Provider', 'Case Type'])
    expect(result.rows[0]).toEqual({ Provider: 'Dr Smith', 'Case Type': 'Knee' })
  })

  it('reports an empty file rather than returning nothing silently', async () => {
    const result = await parseFile(csvFile('p.csv', 'Provider,Case Type\n'))
    expect(result.errors).toContain('File is empty')
    expect(result.rowCount).toBe(0)
  })

  it('rejects an unsupported extension', async () => {
    const result = await parseFile(csvFile('notes.txt', 'anything'))
    expect(result.errors[0]).toMatch(/unsupported file type/i)
    expect(result.rows).toEqual([])
  })

  it('keeps values that look numeric as strings', async () => {
    const result = await parseFile(csvFile('p.csv', 'Provider,Min Age\nDr Smith,0\n'))
    expect(result.rows[0]['Min Age']).toBe('0')
  })

  it('rejects files and cells that exceed import safety limits', async () => {
    const oversizedFile = new File(
      [new Uint8Array(IMPORT_LIMITS.fileBytes + 1)],
      'oversized.csv',
      { type: 'text/csv' },
    )
    expect((await parseFile(oversizedFile)).errors[0]).toMatch(/mb or smaller/i)

    const oversizedCell = csvFile(
      'cell.csv',
      `Provider,Case Type\n${'x'.repeat(IMPORT_LIMITS.cellCharacters + 1)},Knee\n`,
    )
    expect((await parseFile(oversizedCell)).errors).toContain(
      `A cell exceeds ${IMPORT_LIMITS.cellCharacters.toLocaleString()} characters`,
    )
  })
})

describe('parseFile — Excel', () => {
  it('reads headers and rows', async () => {
    const result = await parseFile(
      xlsxFile('p.xlsx', [
        ['Provider', 'Case Type'],
        ['Dr Smith', 'Knee'],
        ['Dr Jones', 'Hip'],
      ]),
    )
    expect(result.errors).toEqual([])
    expect(result.headers).toEqual(['Provider', 'Case Type'])
    expect(result.rowCount).toBe(2)
    expect(result.rows[1]).toEqual({ Provider: 'Dr Jones', 'Case Type': 'Hip' })
  })

  it('aligns data to the right column when a header is blank in the middle', async () => {
    // Spacer columns are common in hand-maintained spreadsheets. The blank
    // header is dropped, so the remaining headers must still read the cells
    // they actually sit above — not shift left onto their neighbours' data.
    const result = await parseFile(
      xlsxFile('p.xlsx', [
        ['Provider', '', 'Case Type', 'Category'],
        ['Dr Smith', '', 'Knee', 'Sports Medicine'],
      ]),
    )
    expect(result.headers).toEqual(['Provider', 'Case Type', 'Category'])
    expect(result.rows[0]).toEqual({
      Provider: 'Dr Smith',
      'Case Type': 'Knee',
      Category: 'Sports Medicine',
    })
  })

  it('aligns data when the leading column has a blank header', async () => {
    const result = await parseFile(
      xlsxFile('p.xlsx', [
        ['', 'Provider', 'Case Type'],
        ['', 'Dr Smith', 'Knee'],
      ]),
    )
    expect(result.headers).toEqual(['Provider', 'Case Type'])
    expect(result.rows[0]).toEqual({ Provider: 'Dr Smith', 'Case Type': 'Knee' })
  })

  it('drops fully blank rows', async () => {
    const result = await parseFile(
      xlsxFile('p.xlsx', [
        ['Provider', 'Case Type'],
        ['Dr Smith', 'Knee'],
        ['', ''],
        ['Dr Jones', 'Hip'],
      ]),
    )
    expect(result.rowCount).toBe(2)
  })

  it('fills missing trailing cells with empty strings', async () => {
    const result = await parseFile(
      xlsxFile('p.xlsx', [
        ['Provider', 'Case Type', 'Category'],
        ['Dr Smith', 'Knee'],
      ]),
    )
    expect(result.rows[0]).toEqual({
      Provider: 'Dr Smith',
      'Case Type': 'Knee',
      Category: '',
    })
  })

  it('reports an empty sheet', async () => {
    const result = await parseFile(xlsxFile('p.xlsx', [['Provider', 'Case Type']]))
    expect(result.errors).toContain('File is empty')
  })

  it('stringifies numeric cells rather than dropping them', async () => {
    const result = await parseFile(
      xlsxFile('p.xlsx', [
        ['Provider', 'Min Age'],
        ['Dr Smith', 0],
      ]),
    )
    expect(result.rows[0]['Min Age']).toBe('0')
  })
})
