'use strict';

const $ = selector => document.querySelector(selector);
const defaults = [
  { name: '高德地图', url: 'https://www.amap.com', color: '#a5cff8' },
  { name: '百度地图', url: 'https://map.baidu.com', color: '#a7dbcb' },
  { name: 'Notion', url: 'https://www.notion.so', color: '#dce4f0' },
  { name: 'GPT', url: 'https://chatgpt.com', color: '#a4e0d2' },
  { name: 'Bilibili', url: 'https://www.bilibili.com', color: '#e8b1ca' }
];
const localFavicons = { 'amap.com': 'amap.ico', 'map.baidu.com': 'baidu-maps.ico' };
const brands = {
  'chatgpt.com': 'openai', 'openai.com': 'openai', 'notion.so': 'notion',
  'notion.com': 'notion', 'bilibili.com': 'bilibili',
  'youtube.com': 'youtube', 'github.com': 'github'
};
function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch {
    $('#storage-notice').textContent = '浏览器暂时无法保存设置；这次修改会在关闭页面后丢失。';
    $('#storage-notice').hidden = false;
  }
}
function websiteURL(raw) {
  let value = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = 'https://' + value;
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('Invalid website URL');
  }
  return url;
}
let links = read('orbit-links', defaults);
if (!Array.isArray(links)) links = defaults;
links = links.filter(link => {
  try { return typeof link?.name === 'string' && link.name.trim() && websiteURL(link.url); }
  catch { return false; }
}).map(link => ({ ...link, url: websiteURL(link.url).href }));
// Apply the requested preset once; retain user-added links and a recovery copy.
if (read('orbit-preset-version', 0) < 18) {
  const hostOf = link => new URL(link.url).hostname.replace(/^www\./, '');
  const remaining = [...links];
  const previous = [...links];
  links = defaults.map(preset => {
    const index = remaining.findIndex(link => hostOf(link) === hostOf(preset));
    return index < 0 ? { ...preset } : remaining.splice(index, 1)[0];
  });
  links.push(...remaining.filter(link => {
    const url = new URL(link.url);
    const untouchedDemo = (hostOf(link) === 'youtube.com' && link.name === 'YouTube')
      || (hostOf(link) === 'github.com' && link.name === 'GitHub');
    return !(untouchedDemo && url.pathname === '/' && !url.search && !url.hash);
  }));
  if (read('orbit-links', null) !== null) save('orbit-links-before-preset-18', previous);
  save('orbit-links', links);
  save('orbit-preset-version', 18);
}
let editing = false;
let selected = -1;

function renderLinks() {
  const root = $('#shortcuts');
  root.replaceChildren();
  document.body.classList.toggle('editing-bookmarks', editing);
  $('#edit').setAttribute('aria-pressed', String(editing));
  $('#edit span').textContent = editing ? '完成' : '编辑';
  links.forEach((link, index) => {
    const node = document.createElement(editing ? 'button' : 'a');
    node.className = 'shortcut' + (editing ? ' is-editing' : '');
    node.setAttribute('aria-label', (editing ? '编辑 ' : '打开 ') + link.name);
    if (editing) {
      node.type = 'button';
      node.addEventListener('click', () => openEditor(index));
    } else {
      node.href = link.url;
      node.rel = 'noopener noreferrer';
    }
    const tile = document.createElement('span');
    tile.className = 'tile';
    const accent = /^#[a-f0-9]{3,8}$/i.test(link.color || '') ? link.color : '#b4c9ea';
    tile.style.setProperty('--accent', accent);
    const host = new URL(link.url).hostname.replace(/^www\./, '');
    const brand = brands[host];
    const logo = document.createElement('img');
    logo.alt = '';
    logo.width = 27;
    logo.height = 27;
    logo.decoding = 'async';
    logo.referrerPolicy = 'no-referrer';
    logo.src = localFavicons[host] ? 'icons/' + localFavicons[host] : brand ? 'icons/' + brand + '.svg'
      : 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=64';
    logo.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'monogram';
      fallback.textContent = Array.from(link.name)[0].toUpperCase();
      tile.replaceChildren(fallback);
    }, { once: true });
    tile.append(logo);
    const label = document.createElement('span');
    label.className = 'shortcut-name';
    label.textContent = link.name;
    node.append(tile, label);
    if (editing) {
      const badge = document.createElement('span');
      badge.className = 'edit-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 16-1 5 5-1L20 8l-4-4L4 16Z"/></svg>';
      node.append(badge);
    }
    root.append(node);
  });
  $('#empty-state').hidden = links.length !== 0;
  document.dispatchEvent(new Event('orbit:linkschange'));
}
function openEditor(index) {
  selected = index;
  $('#dialog-title').textContent = index < 0 ? '添加网站' : '编辑网站';
  $('#link-name').value = index < 0 ? '' : links[index].name;
  $('#link-url').value = index < 0 ? '' : links[index].url;
  $('#delete').hidden = index < 0;
  $('#link-error').textContent = '';
  $('#editor').showModal();
}
$('#add').addEventListener('click', () => openEditor(-1));
$('#edit').addEventListener('click', () => { editing = !editing; renderLinks(); });
document.querySelectorAll('.close').forEach(button => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
$('#link-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const name = $('#link-name').value.trim();
    const url = websiteURL($('#link-url').value);
    if (!name) throw new Error('Missing name');
    const entry = { name, url: url.href };
    if (selected < 0) links.push(entry);
    else links[selected] = { ...links[selected], ...entry };
    save('orbit-links', links);
    renderLinks();
    $('#editor').close();
  } catch {
    $('#link-error').textContent = '请输入网站名称和有效的 http / https 网址。';
  }
});
$('#delete').addEventListener('click', () => {
  if (selected < 0) return;
  links.splice(selected, 1);
  save('orbit-links', links);
  renderLinks();
  $('#editor').close();
});
$('#search').addEventListener('submit', event => {
  event.preventDefault();
  const query = $('#query').value.trim();
  if (!query) return;
  let target;
  if (/^https?:\/\//i.test(query) || /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i.test(query)) {
    try { target = websiteURL(query).href; } catch { /* Search malformed URLs as text. */ }
  }
  location.href = target || 'https://www.baidu.com/s?wd=' + encodeURIComponent(query);
});

function tick() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  $('#clock').innerHTML = hours + '<span>:</span>' + minutes;
  $('#clock').setAttribute('aria-label', hours + ':' + minutes);
  const weekday = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const month = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  $('#date').textContent = weekday + ' · ' + month + ' ' + String(now.getDate()).padStart(2, '0');
  $('#date').setAttribute('aria-label', now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }));
}
tick();
setInterval(tick, 1000);
renderLinks();

const defaultCity = { name: '上海', latitude: 31.23, longitude: 121.47 };
let city = read('orbit-city', defaultCity);
if (!city || typeof city.name !== 'string' || !Number.isFinite(city.latitude) || !Number.isFinite(city.longitude)) city = defaultCity;
const weatherPaths = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20 15.6A8.5 8.5 0 0 1 8.4 4 8.5 8.5 0 1 0 20 15.6Z"/>',
  cloud: '<path d="M6 18h12a4 4 0 0 0 0-8 6 6 0 0 0-11.5-2A5 5 0 0 0 6 18Z"/>',
  rain: '<path d="M6 15h12a4 4 0 0 0 0-8A6 6 0 0 0 7 6a4.5 4.5 0 0 0-1 9Zm2 3-1 3m6-3-1 3m6-3-1 3"/>',
  snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4m13 9-4 1 1 4M7 19l1-4-4-1M17 5l-1 4 4 1"/>',
  storm: '<path d="M6 15a4.5 4.5 0 0 1 1-9 6 6 0 0 1 11 1 4 4 0 0 1 0 8M13 12l-4 6h5l-2 5"/>',
  fog: '<path d="M4 9h16M2 13h20M5 17h14"/>'
};
function weatherCondition(code, isDay) {
  if (code === 0) return ['晴', isDay ? 'sun' : 'moon'];
  if (code <= 3) return ['多云', 'cloud'];
  if (code === 45 || code === 48) return ['雾', 'fog'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['雪', 'snow'];
  if (code >= 95) return ['雷雨', 'storm'];
  return ['雨', 'rain'];
}
let weatherRequest = 0;
async function updateWeather() {
  const request = ++weatherRequest;
  $('#weather-city').textContent = city.name;
  $('#weather-detail').textContent = '正在获取';
  $('#temperature').textContent = '—';
  try {
    const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + city.latitude + '&longitude=' + city.longitude + '&current=temperature_2m,weather_code,is_day&timezone=auto', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Weather unavailable');
    const data = await response.json();
    if (request !== weatherRequest) return;
    if (!Number.isFinite(data.current?.temperature_2m) || !Number.isFinite(data.current.weather_code)) throw new Error('Invalid weather');
    const [description, icon] = weatherCondition(data.current.weather_code, data.current.is_day);
    $('#temperature').textContent = Math.round(data.current.temperature_2m) + '°';
    $('#weather-detail').textContent = description;
    $('#weather-icon').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' + weatherPaths[icon] + '</svg>';
    $('#weather').setAttribute('aria-label', city.name + '，' + description + '，' + $('#temperature').textContent + '，点击切换城市');
  } catch {
    if (request !== weatherRequest) return;
    $('#temperature').textContent = '—';
    $('#weather-detail').textContent = '暂时无法获取';
    $('#weather').setAttribute('aria-label', city.name + '，天气暂时无法获取，点击切换城市');
  }
}
$('#weather').addEventListener('click', () => {
  $('#city-input').value = city.name;
  $('#city-error').textContent = '';
  $('#city-results').replaceChildren();
  $('#city-dialog').showModal();
});
let cityRequest = 0;
$('#city-dialog').addEventListener('close', () => { cityRequest++; $('#city-submit').disabled = false; });
$('#city-form').addEventListener('submit', async event => {
  event.preventDefault();
  const query = $('#city-input').value.trim();
  if (!query) return;
  const request = ++cityRequest;
  $('#city-error').textContent = '正在查找…';
  $('#city-results').replaceChildren();
  $('#city-submit').disabled = true;
  const aliases = { '上海': 'Shanghai', '北京': 'Beijing', '大阪': 'Osaka', '东京': 'Tokyo', '杭州': 'Hangzhou', '广州': 'Guangzhou', '深圳': 'Shenzhen' };
  try {
    const response = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(aliases[query] || query) + '&count=5&language=zh&format=json', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Geocoding unavailable');
    const data = await response.json();
    if (request !== cityRequest) return;
    $('#city-error').textContent = data.results?.length ? '请选择城市：' : '未找到，请试试城市的英文名。';
    (data.results || []).forEach(result => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = [result.name, result.admin1, result.country].filter(Boolean).join(' · ');
      button.addEventListener('click', () => {
        city = { name: result.name, latitude: result.latitude, longitude: result.longitude };
        save('orbit-city', city);
        $('#city-dialog').close();
        updateWeather();
      });
      $('#city-results').append(button);
    });
  } catch {
    if (request === cityRequest) $('#city-error').textContent = '天气服务暂时无法连接，请稍后重试。';
  } finally {
    if (request === cityRequest) $('#city-submit').disabled = false;
  }
});
updateWeather();
setInterval(updateWeather, 1800000);

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let paused = Boolean(read('orbit-motion-paused', reducedMotion.matches));
function motionUI() {
  document.body.classList.toggle('motion-paused', paused);
  $('#motion').setAttribute('aria-pressed', String(paused));
  const label = paused ? '开启动效' : '暂停动效';
  $('#motion').setAttribute('aria-label', label);
  $('#motion span').textContent = label;
  document.dispatchEvent(new Event('orbit:motionchange'));
}
$('#motion').addEventListener('click', () => {
  paused = !paused;
  save('orbit-motion-paused', paused);
  motionUI();
});
reducedMotion.addEventListener('change', event => {
  if (event.matches) { paused = true; motionUI(); }
});
motionUI();

// A quiet static fallback keeps the page usable when WebGL is unavailable.
const fallbackCanvas = $('#space');
const fallbackContext = fallbackCanvas.getContext('2d');
const fallbackStars = Array.from({ length: 190 }, () => [Math.random(), Math.random(), Math.random()]);
function drawFallback() {
  if (!fallbackContext || document.body.classList.contains('galaxy-ready')) return;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  fallbackCanvas.width = innerWidth * dpr;
  fallbackCanvas.height = innerHeight * dpr;
  fallbackContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  fallbackContext.clearRect(0, 0, innerWidth, innerHeight);
  fallbackStars.forEach(([x, y, size]) => {
    fallbackContext.beginPath();
    fallbackContext.arc(x * innerWidth, y * innerHeight, .35 + size * .7, 0, Math.PI * 2);
    fallbackContext.fillStyle = 'rgba(180,200,225,' + (.08 + size * .23) + ')';
    fallbackContext.fill();
  });
}
drawFallback();
addEventListener('resize', drawFallback, { passive: true });
document.addEventListener('orbit:fallback', drawFallback);
let depthStarted = false;
function revealBookmarks() { document.body.classList.remove('orbit-booting'); }
document.addEventListener('orbit:fallback', revealBookmarks);
// Keep links reachable even if the graphics module fails to finish loading.
const revealDeadline = setTimeout(revealBookmarks, 1500);
function loadDepth() {
  if (depthStarted || document.hidden) return;
  depthStarted = true;
  import('./orbital-depth.js').catch(() => {
    document.body.classList.remove('galaxy-ready');
    document.querySelector('.galaxy-canvas')?.remove();
    drawFallback();
  }).finally(() => { clearTimeout(revealDeadline); revealBookmarks(); });
}
// Local module preloads start in the head; initialize without an idle delay.
loadDepth();
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); loadDepth(); } });
