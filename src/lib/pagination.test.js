import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchAllPages } from './pagination.js'

test('fetchAllPages reads every page and stops at the first short page', async () => {
  const source = Array.from({ length: 5 }, (_, index) => ({ id: index + 1 }))
  const ranges = []
  const rows = await fetchAllPages(() => ({
    range(start, end) {
      ranges.push([start, end])
      return Promise.resolve({ data: source.slice(start, end + 1), error: null })
    },
  }), 2)

  assert.deepEqual(rows, source)
  assert.deepEqual(ranges, [[0, 1], [2, 3], [4, 5]])
})

test('fetchAllPages surfaces query failures instead of returning partial data', async () => {
  await assert.rejects(
    fetchAllPages(() => ({
      range() {
        return Promise.resolve({ data: null, error: { message: 'network failed' } })
      },
    }), 10),
    /network failed/,
  )
})

test('fetchAllPages validates its inputs', async () => {
  await assert.rejects(fetchAllPages(null), /createQuery must be a function/)
  await assert.rejects(fetchAllPages(() => ({ range: () => Promise.resolve({ data: [], error: null }) }), 0), /pageSize must be a positive integer/)
})
