const EXPECTED_TEST_ID = 'vlife-cloudbase-http-probe-v1'

export function gatewayBase(value) {
  const url = new URL(value.trim())
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Expected an HTTPS base URL with no credentials, query, or fragment.')
  }
  return url.href.replace(/\/+$/, '')
}

export async function probe(base, endpoint, fetchImpl = globalThis.fetch) {
  const started = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  const result = { endpoint, status: null, responseType: null, contentType: null, serverTime: null, elapsedMs: null, error: null }
  try {
    const headers = endpoint === 'cors-test' ? { 'X-VLife-Cors-Probe': '1' } : {}
    const response = await fetchImpl(base + '/' + endpoint, {
      method: 'GET', headers, mode: 'cors', credentials: 'omit', redirect: 'error', signal: controller.signal,
    })
    result.status = response.status
    result.responseType = response.type
    result.contentType = response.headers.get('content-type')
    if (!response.ok) {
      result.error = 'HTTP_ERROR'
    } else if (!result.contentType?.toLowerCase().startsWith('application/json')) {
      result.error = 'EXPECTED_JSON'
    } else {
      const payload = await response.json()
      if (response.status !== 200 || payload?.testId !== EXPECTED_TEST_ID || payload.endpoint !== endpoint ||
          typeof payload.serverTime !== 'string' || !Number.isFinite(Date.parse(payload.serverTime))) {
        result.error = 'UNEXPECTED_TEST_RESPONSE'
      } else if (endpoint === 'cors-test' && payload.probeHeaderReceived !== true) {
        result.error = 'PROBE_HEADER_MISSING'
      } else {
        result.serverTime = payload.serverTime
      }
    }
  } catch (error) {
    result.error = controller.signal.aborted ? 'TIMEOUT' :
      error instanceof SyntaxError ? 'INVALID_JSON' : 'FETCH_BLOCKED_OR_NETWORK_ERROR'
  } finally {
    clearTimeout(timer)
    result.elapsedMs = Math.round(performance.now() - started)
  }
  return result
}
