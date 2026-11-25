const ORIGIN = 'https://vvspicesh.github.io'
const CENTER = [116.397559, 39.89621]
const DESTINATION = [116.408481, 39.904408]

export function sdkOptions(base, value) {
  const service = new URL(base.trim())
  if (service.protocol !== 'https:' || service.username || service.password || service.search || service.hash ||
      service.pathname.replace(/\/$/, '') !== '/_AMapService') {
    throw new Error('INVALID_SERVICE_HOST')
  }
  const key = value.trim()
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new Error('INVALID_BROWSER_KEY')
  const sdk = new URL('https://webapi.amap.com/maps')
  sdk.searchParams.set('v', '2.0')
  sdk.searchParams.set('key', key)
  return { serviceHost: service.origin + '/_AMapService', sdkUrl: sdk.href }
}

function withDeadline(operation) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), 15000)
    Promise.resolve().then(operation).then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

function loadSDK(options) {
  window._AMapSecurityConfig = { serviceHost: options.serviceHost }
  const pending = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = options.sdkUrl
    script.onload = () => window.AMap ? resolve(window.AMap) : reject(new Error('SDK_UNAVAILABLE'))
    script.onerror = () => reject(new Error('SDK_LOAD_FAILED'))
    document.head.append(script)
  })
  return pending
}

function sdkResult(invoke, valid) {
  return new Promise((resolve, reject) => {
    invoke((status, result) => {
      try {
        if (status !== 'complete' || !valid(result)) throw new Error('SDK_RESULT_FAILED')
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })
}

export async function verify(AMap, run) {
  await run('底图加载', () => new Promise((resolve) => {
    const map = new AMap.Map('map', { center: CENTER, zoom: 14 })
    map.on('complete', resolve)
  }))
  await run('坐标转换', () => sdkResult(
    (done) => AMap.convertFrom(CENTER, 'gps', done),
    (result) => Boolean(result?.locations?.length),
  ))
  await run('加载 POI 与步行插件', () => new Promise((resolve) => AMap.plugin(['AMap.PlaceSearch', 'AMap.Walking'], resolve)))
  await run('周边 POI', () => sdkResult(
    (done) => new AMap.PlaceSearch({ pageSize: 5 }).searchNearBy('餐饮', CENTER, 1500, done),
    (result) => Boolean(result?.poiList?.pois?.length),
  ))
  await run('步行路线', () => sdkResult(
    (done) => new AMap.Walking().search(CENTER, DESTINATION, done),
    (result) => Boolean(result?.routes?.length),
  ))
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('#setup')
  const status = document.querySelector('#status')
  const results = document.querySelector('#results')
  const button = form.querySelector('button')
  if (location.origin !== ORIGIN) {
    button.disabled = true
    status.textContent = '请从 https://vvspicesh.github.io 下的独立测试页运行。'
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (location.origin !== ORIGIN || button.disabled) return
    const key = document.querySelector('#key')
    let options
    try {
      options = sdkOptions(document.querySelector('#host').value, key.value)
    } catch {
      status.textContent = '请检查 HTTPS 代理地址是否以 /_AMapService 结尾，并输入新的 Web 端 Key。'
      return
    }
    key.value = ''
    button.disabled = true
    status.textContent = '验证中…'
    let failed = false
    const run = async (label, operation) => {
      const item = document.createElement('li')
      const start = performance.now()
      results.append(item)
      item.textContent = label + ' · 等待中'
      try {
        const result = await withDeadline(operation)
        item.textContent = label + ' · 通过 · ' + Math.round(performance.now() - start) + ' ms'
        return result
      } catch (error) {
        failed = true
        item.textContent = label + (error.message === 'TIMEOUT' ? ' · 超时' : ' · 失败') +
          ' · ' + Math.round(performance.now() - start) + ' ms'
      }
    }
    const sdk = await run('JSAPI 加载', () => loadSDK(options))
    if (sdk) await verify(sdk, run)
    status.textContent = failed ? '存在失败项。请核对网关与 SDK 请求。' : 'SDK 回调全部通过，请目视确认地图并核对代理请求。'
  })
}
