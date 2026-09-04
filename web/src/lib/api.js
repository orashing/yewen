import { supabase, supabaseConfigured } from './supabase'

export const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 130000)

async function authHeaders() {
  const headers = {'Content-Type':'application/json'}
  if (supabaseConfigured) {
    const {data:{session}} = await supabase.auth.getSession()
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  }
  return headers
}

async function parseApiError(response) {
  const text = await response.text()
  try {
    const data = JSON.parse(text)
    if (data?.detail) return String(data.detail)
    if (data?.error) return String(data.error)
  } catch {}
  return text || `HTTP ${response.status}`
}

async function request(path, {method='GET', payload, auth=true, timeoutMs=DEFAULT_TIMEOUT_MS}={}) {
  const controller = new AbortController()
  const timer = setTimeout(()=>controller.abort(), Math.max(3000, timeoutMs))
  try {
    const options = {method, signal:controller.signal, headers:auth ? await authHeaders() : {'Content-Type':'application/json'}}
    if (payload !== undefined) options.body = JSON.stringify(payload)
    const response = await fetch(`${API}${path}`, options)
    if (!response.ok) throw new Error(await parseApiError(response))
    return await response.json()
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`请求超时（>${Math.round(timeoutMs/1000)}秒），任务未确认完成，请稍后重试。`)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

const post = (path, payload, timeoutMs=DEFAULT_TIMEOUT_MS) => request(path,{method:'POST',payload,timeoutMs})

export const getReady = () => request('/ready',{auth:false,timeoutMs:10000})
export const getHealth = () => request('/health',{auth:false,timeoutMs:10000})
export const getAiPolicy = () => request('/v1/ai/policy',{timeoutMs:10000})

export const suggestTopics = payload => post('/v1/topics/suggest', payload)
export const generateBrief = payload => post('/v1/brief', payload)
export const generateDraft = payload => post('/v1/draft', payload)
export const factCheck = payload => post('/v1/fact-check', payload)
export const generateCardPlan = payload => post('/v1/cards/plan', payload)
export const scanTopicRadar = payload => post('/v1/topics/radar', payload)
export const planCalendar = payload => post('/v1/calendar/plan', payload)
export const repurposeContent = payload => post('/v1/repurpose', payload)
export const sweepTrendSignals = payload => post('/v1/trends/sweep', payload)
export const runEditorialDirector = payload => post('/v1/editorial/director', payload)
export const reviewEditorial = payload => post('/v1/editorial/review', payload)
export const buildXhsNativeTextPlan = payload => post('/v1/xhs/native-text-plan', payload)
export const producePipeline = payload => post('/v1/pipeline/produce', payload, 240000)
export const runAutopilot = payload => post('/v1/pipeline/autopilot', payload, 300000)
export const getAiUsage = () => request('/v1/ai/usage',{timeoutMs:10000})
