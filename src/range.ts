// Older Umami releases reject `period`, so relative ranges are turned into startAt/endAt here.

export const PERIODS = ['today', 'yesterday', '24h', '7d', '30d', '90d', '6month', '12month'] as const
export type Period = (typeof PERIODS)[number]

export interface RangeInput {
  period?: Period
  startAt?: number | string
  endAt?: number | string
  timezone?: string
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

function toMillis(value: number | string, field: string): number {
  const ms = typeof value === 'number' ? value : /^\d+$/.test(value) ? Number(value) : Date.parse(value)
  if (!Number.isFinite(ms)) throw new RangeError(`${field} is not a millisecond timestamp or ISO date: ${value}`)
  return ms
}

/** Offset of `timeZone` from UTC at `at`, in milliseconds. */
function zoneOffset(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(at / 1000) * 1000
}

function startOfDay(at: number, timeZone: string): number {
  const offset = zoneOffset(at, timeZone)
  const local = at + offset
  return local - (((local % DAY) + DAY) % DAY) - offset
}

export function resolveRange(input: RangeInput, now = Date.now()): { startAt: number; endAt: number } {
  const timeZone = input.timezone || 'UTC'
  if (input.period && (input.startAt !== undefined || input.endAt !== undefined)) {
    throw new RangeError('Give either period or startAt/endAt, not both.')
  }
  if (input.startAt !== undefined || input.endAt !== undefined) {
    const startAt = input.startAt === undefined ? now - 7 * DAY : toMillis(input.startAt, 'startAt')
    const endAt = input.endAt === undefined ? now : toMillis(input.endAt, 'endAt')
    if (startAt >= endAt) throw new RangeError('startAt must be earlier than endAt.')
    return { startAt, endAt }
  }
  switch (input.period ?? '7d') {
    case 'today':
      return { startAt: startOfDay(now, timeZone), endAt: now }
    case 'yesterday': {
      const today = startOfDay(now, timeZone)
      return { startAt: startOfDay(today - 1, timeZone), endAt: today - 1 }
    }
    case '24h':
      return { startAt: now - DAY, endAt: now }
    case '7d':
      return { startAt: now - 7 * DAY, endAt: now }
    case '30d':
      return { startAt: now - 30 * DAY, endAt: now }
    case '90d':
      return { startAt: now - 90 * DAY, endAt: now }
    case '6month':
      return { startAt: now - 182 * DAY, endAt: now }
    case '12month':
      return { startAt: now - 365 * DAY, endAt: now }
  }
}
