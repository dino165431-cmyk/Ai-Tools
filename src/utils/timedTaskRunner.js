import { watch } from 'vue'
import { getTimedTasks, updateTimedTask } from '@/utils/configListener'
import { runTimedTaskOnce } from '@/utils/timedTaskRunnerExecutor'

const MIN_RESCHEDULE_MS = 500
const MAX_TIMEOUT_MS = 2_147_483_647 // setTimeout max (~24.8 days)

const timedTasks = getTimedTasks()

let hasInit = false
const scheduleMap = new Map() // taskId -> { timeoutId, nextRunAt }
const runningTaskIds = new Set()

function nowMs() {
  return Date.now()
}

function clearSchedule(taskId) {
  const existing = scheduleMap.get(taskId)
  if (!existing) return
  try {
    clearTimeout(existing.timeoutId)
  } catch {
    // ignore
  }
  scheduleMap.delete(taskId)
}

function safeNumber(n) {
  const num = Number(n)
  return Number.isFinite(num) ? num : null
}

function parseHms(timeStr) {
  const s = String(timeStr || '').trim()
  if (!s) return null
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  const ss = m[3] == null ? 0 : Number(m[3])
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null
  if (!Number.isFinite(mm) || mm < 0 || mm > 59) return null
  if (!Number.isFinite(ss) || ss < 0 || ss > 59) return null
  return { hh, mm, ss }
}

function parseYmd(dateStr) {
  const s = String(dateStr || '').trim()
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || y < 1970 || y > 9999) return null
  if (!Number.isFinite(mo) || mo < 1 || mo > 12) return null
  if (!Number.isFinite(d) || d < 1 || d > 31) return null
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return { y, mo, d }
}

function buildDateAtTime(baseDate, time) {
  if (!baseDate || !time) return null
  const dt = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), time.hh, time.mm, time.ss, 0)
  return dt.getTime()
}

function nextDailyRunAt(timeStr, afterMs) {
  const time = parseHms(timeStr)
  if (!time) return null

  const after = new Date(afterMs)
  const todayAt = buildDateAtTime(after, time)
  if (todayAt == null) return null

  if (todayAt > afterMs) return todayAt
  const tomorrow = new Date(after.getFullYear(), after.getMonth(), after.getDate() + 1)
  return buildDateAtTime(tomorrow, time)
}

function nextWeeklyRunAt({ timeStr, weekdays }, afterMs) {
  const time = parseHms(timeStr)
  if (!time) return null
  const days = Array.isArray(weekdays) ? weekdays.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : []
  const selected = new Set(days.filter((d) => d >= 1 && d <= 7))
  if (!selected.size) return null

  const after = new Date(afterMs)
  const base = new Date(after.getFullYear(), after.getMonth(), after.getDate())
  const baseDay = base.getDay() // 0 Sun .. 6 Sat

  const toWeekday = (jsDay) => (jsDay === 0 ? 7 : jsDay) // 1 Mon .. 7 Sun

  let best = null
  for (let i = 0; i < 14; i++) {
    const candDate = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
    const wd = toWeekday((baseDay + i) % 7)
    if (!selected.has(wd)) continue
    const t = buildDateAtTime(candDate, time)
    if (t == null) continue
    if (t > afterMs && (best == null || t < best)) best = t
  }
  return best
}

function nextMonthlyRunAt({ timeStr, monthDays }, afterMs) {
  const time = parseHms(timeStr)
  if (!time) return null
  const days = Array.isArray(monthDays) ? monthDays.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : []
  const selected = Array.from(new Set(days.filter((d) => d >= 1 && d <= 31))).sort((a, b) => a - b)
  if (!selected.length) return null

  const after = new Date(afterMs)
  let y = after.getFullYear()
  let m = after.getMonth() // 0-based

  for (let monthOffset = 0; monthOffset < 24; monthOffset++) {
    const firstOfMonth = new Date(y, m, 1)
    const year = firstOfMonth.getFullYear()
    const month = firstOfMonth.getMonth()

    for (const d of selected) {
      const cand = new Date(year, month, d, time.hh, time.mm, time.ss, 0)
      if (cand.getMonth() !== month) continue // invalid day for month
      const t = cand.getTime()
      if (t > afterMs) return t
    }

    m += 1
    if (m > 11) {
      y += 1
      m = 0
    }
  }
  return null
}

function computeNextRunAt(task, afterMs) {
  const t = task?.trigger && typeof task.trigger === 'object' ? task.trigger : {}
  const type = String(t.type || '').trim()

  if (type === 'once') {
    const date = parseYmd(t.date)
    const time = parseHms(t.time)
    if (!date || !time) return null
    const at = new Date(date.y, date.mo - 1, date.d, time.hh, time.mm, time.ss, 0).getTime()
    return at > afterMs ? at : null
  }

  if (type === 'interval') {
    const intervalSeconds = safeNumber(t.intervalSeconds)
    if (!intervalSeconds || intervalSeconds <= 0) return null

    const lastRunAt = typeof task.lastRunAt === 'string' && task.lastRunAt ? Date.parse(task.lastRunAt) : null
    if (lastRunAt && Number.isFinite(lastRunAt)) {
      const next = lastRunAt + Math.floor(intervalSeconds * 1000)
      return next > afterMs ? next : afterMs + Math.floor(intervalSeconds * 1000)
    }

    const first = nextDailyRunAt(t.time, afterMs)
    return first
  }

  if (type === 'daily') {
    return nextDailyRunAt(t.time, afterMs)
  }

  if (type === 'weekly') {
    return nextWeeklyRunAt({ timeStr: t.time, weekdays: t.weekdays }, afterMs)
  }

  if (type === 'monthly') {
    return nextMonthlyRunAt({ timeStr: t.time, monthDays: t.monthDays }, afterMs)
  }

  return null
}

function getTaskById(taskId) {
  const list = Array.isArray(timedTasks.value) ? timedTasks.value : []
  return list.find((t) => t && t._id === taskId) || null
}

async function runTask(taskId) {
  if (runningTaskIds.has(taskId)) return
  const task = getTaskById(taskId)
  if (!task || !task.enabled) return

  runningTaskIds.add(taskId)
  const startedAt = new Date()

  try {
    await runTimedTaskOnce(task, { startedAt })

    const nextPatch = { lastRunAt: startedAt.toISOString() }
    if (String(task?.trigger?.type || '').trim() === 'once') {
      nextPatch.enabled = false
    }
    await updateTimedTask(taskId, nextPatch)
  } catch (err) {
    try {
      await updateTimedTask(taskId, {
        lastError: err?.message || String(err),
        lastErrorAt: new Date().toISOString()
      })
    } catch {
      // ignore
    }
    console.warn('[timedTask] run failed', taskId, err)
  } finally {
    runningTaskIds.delete(taskId)
    scheduleOne(taskId)
  }
}

function scheduleOne(taskId) {
  const task = getTaskById(taskId)
  if (!task || !task.enabled) {
    clearSchedule(taskId)
    return
  }

  const after = nowMs()
  const nextRunAt = computeNextRunAt(task, after)
  if (!nextRunAt) {
    clearSchedule(taskId)
    return
  }

  const existing = scheduleMap.get(taskId)
  if (existing && existing.nextRunAt === nextRunAt) return
  clearSchedule(taskId)

  const delayRaw = nextRunAt - after
  const delay = Math.max(MIN_RESCHEDULE_MS, Math.min(delayRaw, MAX_TIMEOUT_MS))
  const timeoutId = setTimeout(() => runTask(taskId), delay)
  scheduleMap.set(taskId, { timeoutId, nextRunAt })
}

function rescheduleAll() {
  const list = Array.isArray(timedTasks.value) ? timedTasks.value : []
  const idSet = new Set(list.filter((t) => t && t._id).map((t) => t._id))

  for (const existingId of scheduleMap.keys()) {
    if (!idSet.has(existingId)) clearSchedule(existingId)
  }

  list.forEach((t) => {
    if (!t || !t._id) return
    scheduleOne(t._id)
  })
}

function buildScheduleSignature() {
  const list = Array.isArray(timedTasks.value) ? timedTasks.value : []
  return list
    .filter((task) => task && task._id)
    .map((task) => {
      const trigger = task?.trigger && typeof task.trigger === 'object' ? task.trigger : {}
      const weekdays = Array.isArray(trigger.weekdays)
        ? trigger.weekdays.map((x) => Number(x)).filter((x) => Number.isFinite(x)).sort((a, b) => a - b).join(',')
        : ''
      const monthDays = Array.isArray(trigger.monthDays)
        ? trigger.monthDays.map((x) => Number(x)).filter((x) => Number.isFinite(x)).sort((a, b) => a - b).join(',')
        : ''

      return [
        String(task._id || ''),
        task.enabled ? '1' : '0',
        String(task.lastRunAt || ''),
        String(trigger.type || ''),
        String(trigger.date || ''),
        String(trigger.time || ''),
        String(trigger.intervalSeconds || ''),
        weekdays,
        monthDays
      ].join('|')
    })
    .sort()
    .join(';;')
}

export function initTimedTaskRunner() {
  if (hasInit) return
  hasInit = true

  watch(
    buildScheduleSignature,
    () => {
      rescheduleAll()
    },
    { immediate: true }
  )
}
