const W = 1080
const H = 1440
const PAD = 92

function wrap(ctx, text, maxWidth) {
  const chars = Array.from(text || '')
  const lines = []
  let line = ''
  for (const ch of chars) {
    const next = line + ch
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = ch
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

export function renderCard(card, index = 0, total = 1) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#f6f3ec'
  ctx.fillRect(0, 0, W, H)

  // Editorial accent block; intentionally simple so the whole account stays visually consistent.
  ctx.fillStyle = '#171717'
  ctx.fillRect(0, 0, 24, H)

  ctx.fillStyle = '#171717'
  ctx.font = '600 30px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText((card.eyebrow || '升学决策').toUpperCase(), PAD, 120)

  ctx.fillStyle = '#8a8378'
  ctx.font = '500 26px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, W - PAD, 120)
  ctx.textAlign = 'left'

  const cover = card.layout === 'cover'
  ctx.fillStyle = '#171717'
  ctx.font = `${cover ? 800 : 760} ${cover ? 78 : 64}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`
  let y = cover ? 330 : 260
  const headlineLines = wrap(ctx, card.headline, W - PAD * 2)
  for (const line of headlineLines.slice(0, cover ? 5 : 4)) {
    ctx.fillText(line, PAD, y)
    y += cover ? 104 : 88
  }

  if (cover) {
    y += 50
    ctx.fillStyle = '#e2ddd2'
    roundRect(ctx, PAD, y, W - PAD * 2, 3, 2)
    ctx.fill()
    y += 75
  } else {
    y += 55
  }

  const points = (card.body || []).filter(Boolean).slice(0, 6)
  ctx.font = '500 38px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
  for (const point of points) {
    const lines = wrap(ctx, point, W - PAD * 2 - 58)
    ctx.fillStyle = '#171717'
    ctx.beginPath(); ctx.arc(PAD + 10, y - 12, 7, 0, Math.PI * 2); ctx.fill()
    let ly = y
    for (const line of lines.slice(0, 3)) {
      ctx.fillText(line, PAD + 52, ly)
      ly += 58
    }
    y = ly + 38
    if (y > H - 260) break
  }

  ctx.fillStyle = '#171717'
  ctx.font = '600 27px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText(card.footer || 'O师 · 大学与专业选择', PAD, H - 92)

  return canvas
}

export function cardToBlob(card, index, total) {
  const canvas = renderCard(card, index, total)
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 生成失败')), 'image/png', 0.94))
}

export async function renderPlanToBlobs(cards) {
  const result = []
  for (let i = 0; i < cards.length; i += 1) {
    result.push(await cardToBlob(cards[i], i, cards.length))
  }
  return result
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
