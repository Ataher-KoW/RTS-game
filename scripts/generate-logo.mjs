import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const buildDir = path.join(root, 'build');
const publicDir = path.join(root, 'public');

async function main() {
  await mkdir(buildDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });

  const logoSvg = createLogoSvg();
  await writeFile(path.join(buildDir, 'icon.svg'), logoSvg);
  await writeFile(path.join(publicDir, 'logo.svg'), logoSvg);
  await writeFile(path.join(publicDir, 'favicon.svg'), createFaviconSvg());

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = sizes.map((size) => createPngIcon(size));
  await writeFile(path.join(buildDir, 'icon.ico'), createIco(sizes, pngs));

  console.log(`Generated AT Strategy logo assets: ${sizes.join(', ')}px icon set`);
}

function createLogoSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="946" viewBox="0 0 900 946" role="img" aria-labelledby="title desc">
  <title id="title">AT Strategy</title>
  <desc id="desc">A sci-fi AT Strategy logo with chrome letters, tactical rings, and blue, orange, and purple command nodes.</desc>
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="43%" r="56%">
      <stop offset="0" stop-color="#0f366b"/>
      <stop offset=".42" stop-color="#071426"/>
      <stop offset="1" stop-color="#02070e"/>
    </radialGradient>
    <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d8f2ff"/>
      <stop offset=".2" stop-color="#8dc7ee"/>
      <stop offset=".48" stop-color="#2f6f9d"/>
      <stop offset=".76" stop-color="#b9e4ff"/>
      <stop offset="1" stop-color="#244769"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7dd3fc"/>
      <stop offset=".55" stop-color="#2563eb"/>
      <stop offset="1" stop-color="#0f172a"/>
    </linearGradient>
    <filter id="blueGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="7" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="purpleGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="900" height="946" fill="#02070e"/>
  <rect x="38" y="39" width="39" height="39" fill="none" stroke="#123765" stroke-width="1.2"/>
  <rect x="823" y="39" width="39" height="39" fill="none" stroke="#123765" stroke-width="1.2"/>
  <rect x="38" y="871" width="39" height="39" fill="none" stroke="#123765" stroke-width="1.2"/>
  <rect x="823" y="871" width="39" height="39" fill="none" stroke="#123765" stroke-width="1.2"/>
  <g opacity=".72">
    <circle cx="263" cy="55" r="1.5" fill="#d8f2ff"/>
    <circle cx="593" cy="28" r="1.4" fill="#d8f2ff"/>
    <circle cx="831" cy="29" r="1.1" fill="#d8f2ff"/>
    <circle cx="117" cy="124" r="1" fill="#6ba6d8"/>
    <circle cx="864" cy="171" r="1.2" fill="#d8f2ff"/>
    <circle cx="812" cy="766" r="1.2" fill="#6ba6d8"/>
    <circle cx="237" cy="858" r="1" fill="#6ba6d8"/>
  </g>
  <circle cx="450" cy="387" r="255" fill="none" stroke="#245d93" stroke-width="1.2"/>
  <circle cx="450" cy="387" r="222" fill="none" stroke="#1e426b" stroke-width="1" stroke-dasharray="6 10"/>
  <circle cx="450" cy="387" r="150" fill="url(#bgGlow)" opacity=".72"/>
  <path d="M450 236 591 318 591 480 450 563 309 480 309 318Z" fill="none" stroke="#1e5f9a" stroke-width="1.2" opacity=".58"/>
  <path d="M450 236V520M266 222L391 320M637 219L522 319M450 520v90" stroke="#2a85c8" stroke-width="2" stroke-dasharray="6 7" opacity=".72"/>
  <g filter="url(#blueGlow)">
    <rect x="237" y="206" width="45" height="47" rx="8" fill="#163c68" stroke="#3aa6e8" stroke-width="3"/>
    <rect x="244" y="218" width="32" height="11" rx="2" fill="#d8f2ff"/>
    <circle cx="252" cy="223" r="2" fill="#39bdf8"/>
    <circle cx="268" cy="223" r="2" fill="#39bdf8"/>
    <path d="M243 238h34M248 244h24M235 218h-5v12h5M282 218h5v12h-5" stroke="#3aa6e8" stroke-width="2"/>
  </g>
  <g filter="url(#purpleGlow)">
    <ellipse cx="638" cy="227" rx="31" ry="15" fill="none" stroke="#8a2be2" stroke-width="3"/>
    <ellipse cx="638" cy="227" rx="23" ry="28" fill="none" stroke="#8a2be2" stroke-width="2" transform="rotate(75 638 227)"/>
    <circle cx="638" cy="227" r="8" fill="#a855f7"/>
  </g>
  <g filter="url(#blueGlow)">
    <path d="M352 282 300 489h58l22-89 29 89h51l-74-207Z" fill="url(#chrome)" stroke="#66c6ff" stroke-width="2"/>
    <path d="M398 399h-59l11-44h38Z" fill="#9bd8ff" opacity=".9"/>
    <path d="M472 282h145v55h-56v152h-58V337h-31Z" fill="url(#chrome)" stroke="#66c6ff" stroke-width="2"/>
    <path d="M352 282 386 489M561 337v152" stroke="#e7f8ff" stroke-width="2" opacity=".4"/>
  </g>
  <g filter="url(#purpleGlow)">
    <path d="M419 582h58v58h-58Z" fill="none" stroke="#ff7a00" stroke-width="3"/>
    <circle cx="448" cy="611" r="28" fill="none" stroke="#ff7a00" stroke-width="3"/>
    <circle cx="448" cy="611" r="8" fill="none" stroke="#ff7a00" stroke-width="2"/>
    <path d="M448 575v72M412 611h72" stroke="#ff7a00" stroke-width="2"/>
  </g>
  <text x="450" y="720" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="57" font-weight="900" letter-spacing="12" fill="#d8f2ff">AT STRATEGY</text>
  <circle cx="217" cy="736" r="4" fill="#f97316"/>
  <circle cx="448" cy="736" r="4" fill="#7dd3fc"/>
  <circle cx="679" cy="736" r="4" fill="#a855f7"/>
  <text x="450" y="773" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="16" letter-spacing="8" fill="#38bdf8">COMMAND THE FUTURE</text>
  <path d="M263 793h370" stroke="#1e4d82" stroke-width="2"/>
</svg>
`;
}

function createFaviconSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="38" fill="#02070e"/>
  <circle cx="128" cy="124" r="105" fill="#071426" stroke="#245d93" stroke-width="3"/>
  <circle cx="128" cy="124" r="83" fill="none" stroke="#1e426b" stroke-width="2" stroke-dasharray="5 8"/>
  <path d="M91 73 63 187h31l12-49 16 49h28L109 73Z" fill="#bfe7ff" stroke="#66c6ff" stroke-width="2"/>
  <path d="M143 73h79v31h-30v83h-32v-83h-17Z" fill="#bfe7ff" stroke="#66c6ff" stroke-width="2"/>
  <circle cx="194" cy="67" r="13" fill="none" stroke="#a855f7" stroke-width="4"/>
  <circle cx="128" cy="204" r="18" fill="none" stroke="#ff7a00" stroke-width="4"/>
</svg>
`;
}

function createPngIcon(size) {
  const supersample = size <= 24 ? 5 : 4;
  const image = new RasterImage(size * supersample, size * supersample);
  drawLogoRaster(image);
  const downsampled = image.downsample(supersample);
  return encodePng(downsampled.width, downsampled.height, downsampled.data);
}

function drawLogoRaster(image) {
  const width = image.width;
  const height = image.height;
  const unit = width / 256;
  const centerX = 128 * unit;
  const centerY = 123 * unit;

  image.fill((x, y) => {
    const dx = (x - centerX) / width;
    const dy = (y - centerY) / height;
    const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 3.2);
    return [
      Math.round(2 + glow * 16),
      Math.round(7 + glow * 45),
      Math.round(14 + glow * 92),
      255,
    ];
  });

  image.strokeCircle(centerX, centerY, 104 * unit, 1.6 * unit, [36, 93, 147, 210]);
  image.strokeCircle(centerX, centerY, 84 * unit, 1 * unit, [30, 66, 107, 150]);
  image.strokePolygon([
    [128, 42],
    [190, 78],
    [190, 150],
    [128, 187],
    [66, 150],
    [66, 78],
  ].map(scalePoint(unit)), 1.1 * unit, [42, 133, 200, 120]);

  image.fillCircle(65 * unit, 66 * unit, 13 * unit, [22, 61, 104, 230]);
  image.fillRect(56 * unit, 60 * unit, 18 * unit, 7 * unit, [216, 242, 255, 245]);
  image.strokeRect(54 * unit, 55 * unit, 24 * unit, 24 * unit, 2 * unit, [58, 166, 232, 230]);

  image.strokeCircle(196 * unit, 66 * unit, 13 * unit, 2.4 * unit, [168, 85, 247, 235]);
  image.strokeEllipse(196 * unit, 66 * unit, 21 * unit, 8 * unit, 2 * unit, [168, 85, 247, 200]);
  image.fillCircle(196 * unit, 66 * unit, 4 * unit, [168, 85, 247, 245]);

  const shadow = [3, 10, 19, 155];
  drawGlyphs(image, unit, 3 * unit, 4 * unit, shadow);
  drawGlyphs(image, unit, 0, 0, null);

  image.strokeCircle(128 * unit, 197 * unit, 17 * unit, 2.4 * unit, [249, 115, 22, 240]);
  image.strokeRect(111 * unit, 180 * unit, 34 * unit, 34 * unit, 2 * unit, [249, 115, 22, 220]);
  image.line(128 * unit, 177 * unit, 128 * unit, 217 * unit, 1.2 * unit, [249, 115, 22, 220]);
  image.line(108 * unit, 197 * unit, 148 * unit, 197 * unit, 1.2 * unit, [249, 115, 22, 220]);

  image.fillCircle(55 * unit, 226 * unit, 2.4 * unit, [249, 115, 22, 230]);
  image.fillCircle(128 * unit, 226 * unit, 2.4 * unit, [125, 211, 252, 230]);
  image.fillCircle(201 * unit, 226 * unit, 2.4 * unit, [168, 85, 247, 230]);
}

function drawGlyphs(image, unit, offsetX, offsetY, forcedColor) {
  const chrome = (x, y) => {
    if (forcedColor) {
      return forcedColor;
    }
    const t = Math.max(0, Math.min(1, (y / unit - 76) / 88));
    if (t < 0.26) return mix([232, 249, 255, 255], [100, 184, 229, 255], t / 0.26);
    if (t < 0.56) return mix([100, 184, 229, 255], [31, 89, 133, 255], (t - 0.26) / 0.3);
    return mix([31, 89, 133, 255], [207, 239, 255, 255], (t - 0.56) / 0.44);
  };

  const scale = scalePoint(unit, offsetX, offsetY);
  image.fillPolygon([
    [88, 76],
    [56, 187],
    [88, 187],
    [103, 132],
    [120, 187],
    [148, 187],
    [111, 76],
  ].map(scale), chrome);
  image.fillPolygon([
    [95, 130],
    [118, 130],
    [127, 153],
    [84, 153],
  ].map(scale), forcedColor || [183, 230, 255, 235]);
  image.strokePolygon([
    [88, 76],
    [56, 187],
    [88, 187],
    [103, 132],
    [120, 187],
    [148, 187],
    [111, 76],
  ].map(scale), 1.1 * unit, forcedColor || [102, 198, 255, 210]);

  image.fillPolygon([
    [156, 76],
    [222, 76],
    [222, 104],
    [199, 104],
    [199, 187],
    [168, 187],
    [168, 104],
    [156, 104],
  ].map(scale), chrome);
  image.strokePolygon([
    [156, 76],
    [222, 76],
    [222, 104],
    [199, 104],
    [199, 187],
    [168, 187],
    [168, 104],
    [156, 104],
  ].map(scale), 1.1 * unit, forcedColor || [102, 198, 255, 210]);
}

function scalePoint(unit, offsetX = 0, offsetY = 0) {
  return ([x, y]) => [x * unit + offsetX, y * unit + offsetY];
}

function mix(a, b, t) {
  return a.map((value, index) => Math.round(value + (b[index] - value) * t));
}

class RasterImage {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4);
  }

  fill(colorForPixel) {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        this.setPixel(x, y, colorForPixel(x, y));
      }
    }
  }

  setPixel(x, y, color) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }
    const index = (Math.floor(y) * this.width + Math.floor(x)) * 4;
    const alpha = color[3] / 255;
    const inverse = 1 - alpha;
    this.data[index] = Math.round(color[0] * alpha + this.data[index] * inverse);
    this.data[index + 1] = Math.round(color[1] * alpha + this.data[index + 1] * inverse);
    this.data[index + 2] = Math.round(color[2] * alpha + this.data[index + 2] * inverse);
    this.data[index + 3] = Math.round(255 * alpha + this.data[index + 3] * inverse);
  }

  fillRect(x, y, width, height, color) {
    for (let py = Math.floor(y); py < Math.ceil(y + height); py += 1) {
      for (let px = Math.floor(x); px < Math.ceil(x + width); px += 1) {
        this.setPixel(px, py, color);
      }
    }
  }

  strokeRect(x, y, width, height, thickness, color) {
    this.fillRect(x, y, width, thickness, color);
    this.fillRect(x, y + height - thickness, width, thickness, color);
    this.fillRect(x, y, thickness, height, color);
    this.fillRect(x + width - thickness, y, thickness, height, color);
  }

  fillCircle(cx, cy, radius, color) {
    const minX = Math.floor(cx - radius);
    const maxX = Math.ceil(cx + radius);
    const minY = Math.floor(cy - radius);
    const maxY = Math.ceil(cy + radius);
    const r2 = radius * radius;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) {
          this.setPixel(x, y, color);
        }
      }
    }
  }

  strokeCircle(cx, cy, radius, thickness, color) {
    const minX = Math.floor(cx - radius - thickness);
    const maxX = Math.ceil(cx + radius + thickness);
    const minY = Math.floor(cy - radius - thickness);
    const maxY = Math.ceil(cy + radius + thickness);
    const inner = (radius - thickness / 2) ** 2;
    const outer = (radius + thickness / 2) ** 2;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= inner && d2 <= outer) {
          this.setPixel(x, y, color);
        }
      }
    }
  }

  strokeEllipse(cx, cy, rx, ry, thickness, color) {
    const minX = Math.floor(cx - rx - thickness);
    const maxX = Math.ceil(cx + rx + thickness);
    const minY = Math.floor(cy - ry - thickness);
    const maxY = Math.ceil(cy + ry + thickness);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const value = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
        if (value > 0.82 && value < 1.18) {
          this.setPixel(x, y, color);
        }
      }
    }
  }

  line(x1, y1, x2, y2, thickness, color) {
    const minX = Math.floor(Math.min(x1, x2) - thickness);
    const maxX = Math.ceil(Math.max(x1, x2) + thickness);
    const minY = Math.floor(Math.min(y1, y2) - thickness);
    const maxY = Math.ceil(Math.max(y1, y2) + thickness);
    const length2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / length2));
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * t;
        if ((x - px) ** 2 + (y - py) ** 2 <= (thickness / 2) ** 2) {
          this.setPixel(x, y, color);
        }
      }
    }
  }

  fillPolygon(points, color) {
    const minX = Math.floor(Math.min(...points.map(([x]) => x)));
    const maxX = Math.ceil(Math.max(...points.map(([x]) => x)));
    const minY = Math.floor(Math.min(...points.map(([, y]) => y)));
    const maxY = Math.ceil(Math.max(...points.map(([, y]) => y)));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (pointInPolygon(x + 0.5, y + 0.5, points)) {
          this.setPixel(x, y, typeof color === 'function' ? color(x, y) : color);
        }
      }
    }
  }

  strokePolygon(points, thickness, color) {
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      this.line(current[0], current[1], next[0], next[1], thickness, color);
    }
  }

  downsample(factor) {
    const image = new RasterImage(this.width / factor, this.height / factor);
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const sum = [0, 0, 0, 0];
        for (let sy = 0; sy < factor; sy += 1) {
          for (let sx = 0; sx < factor; sx += 1) {
            const source = ((y * factor + sy) * this.width + (x * factor + sx)) * 4;
            sum[0] += this.data[source];
            sum[1] += this.data[source + 1];
            sum[2] += this.data[source + 2];
            sum[3] += this.data[source + 3];
          }
        }
        const target = (y * image.width + x) * 4;
        const area = factor * factor;
        image.data[target] = Math.round(sum[0] / area);
        image.data[target + 1] = Math.round(sum[1] / area);
        image.data[target + 2] = Math.round(sum[2] / area);
        image.data[target + 3] = Math.round(sum[3] / area);
      }
    }
    return image;
  }
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', Buffer.concat([uint32(width), uint32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const name = Buffer.from(type);
  return Buffer.concat([uint32(data.length), name, data, uint32(crc32(Buffer.concat([name, data])))]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function createIco(sizes, pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);

  const entries = [];
  let offset = 6 + sizes.length * 16;
  for (let index = 0; index < sizes.length; index += 1) {
    const entry = Buffer.alloc(16);
    entry[0] = sizes[index] >= 256 ? 0 : sizes[index];
    entry[1] = sizes[index] >= 256 ? 0 : sizes[index];
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngs[index].length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += pngs[index].length;
  }

  return Buffer.concat([header, ...entries, ...pngs]);
}

await main();
