import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface ParseResult {
  headers: string[]
  rows: Record<string, string>[]
  errors: string[]
  rowCount: number
}

function trimValue(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeRows(rawRows: Record<string, unknown>[]): ParseResult {
  const errors: string[] = []
  const rows = rawRows.map((row) => {
    const normalized: Record<string, string> = {}
    Object.entries(row).forEach(([key, value]) => {
      const header = key.trim()
      if (!header) {
        return
      }
      normalized[header] = trimValue(value)
    })
    return normalized
  })

  const headers = rows.length > 0 ? Object.keys(rows[0]) : []

  if (rows.length === 0) {
    errors.push('File is empty')
  }

  return {
    headers,
    rows,
    errors,
    rowCount: rows.length,
  }
}

async function parseCSV(file: File): Promise<ParseResult> {
  try {
    const text = await file.text()
    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      transformHeader: (header) => header.trim(),
    })

    if (result.errors.length > 0) {
      return {
        headers: [],
        rows: [],
        errors: result.errors.map((e) => e.message),
        rowCount: 0,
      }
    }

    return normalizeRows(result.data)
  } catch (error) {
    return {
      headers: [],
      rows: [],
      errors: [error instanceof Error ? error.message : 'Failed to parse CSV file'],
      rowCount: 0,
    }
  }
}

async function parseExcel(file: File): Promise<ParseResult> {
  try {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]
    const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined

    if (!firstSheet) {
      return {
        headers: [],
        rows: [],
        errors: ['File is empty'],
        rowCount: 0,
      }
    }

    const grid = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1 })
    const headerRow = (grid[0] ?? []).map((cell) => trimValue(cell))

    // Each header keeps the column it actually sits in. Dropping blank headers
    // from the list must not renumber the rest, or every column after a spacer
    // would read its neighbour's cell -- silently, with a plausible-looking
    // preview.
    const headerColumns = headerRow
      .map((header, columnIndex) => ({ header, columnIndex }))
      .filter((entry) => entry.header.length > 0)
    const headers = headerColumns.map((entry) => entry.header)
    const dataRows = grid.slice(1)

    const rows = dataRows
      .map((cells) => {
        const row: Record<string, string> = {}
        headerColumns.forEach(({ header, columnIndex }) => {
          row[header] = trimValue(cells[columnIndex])
        })
        return row
      })
      .filter((row) => Object.values(row).some((value) => value.length > 0))

    const errors: string[] = []
    if (rows.length === 0) {
      errors.push('File is empty')
    }

    return {
      headers,
      rows,
      errors,
      rowCount: rows.length,
    }
  } catch (error) {
    return {
      headers: [],
      rows: [],
      errors: [error instanceof Error ? error.message : 'Failed to parse Excel file'],
      rowCount: 0,
    }
  }
}

export async function parseFile(file: File): Promise<ParseResult> {
  try {
    const extension = file.name.split('.').pop()?.toLowerCase()

    if (extension === 'csv') {
      return await parseCSV(file)
    }
    if (extension === 'xlsx' || extension === 'xls') {
      return await parseExcel(file)
    }

    return {
      headers: [],
      rows: [],
      errors: ['Unsupported file type. Please upload a .csv or .xlsx file.'],
      rowCount: 0,
    }
  } catch (error) {
    return {
      headers: [],
      rows: [],
      errors: [error instanceof Error ? error.message : 'Failed to parse file'],
      rowCount: 0,
    }
  }
}
