import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const background = "#09090b";
const accent = "#ff474b";
const sourcePath = path.join(root, "assets", "branding", "streamtumilogo-source.webp");
const source = await readFile(sourcePath);
const metadata = await sharp(source).metadata();

if (metadata.width !== 800 || metadata.height !== 222 || !metadata.hasAlpha) {
  throw new Error("Expected the canonical StreamTumi source to be an 800x222 WebP with transparency.");
}

// The source has low-alpha WebP noise outside these visible artwork bounds.
const logo = await sharp(source)
  .extract({ left: 24, top: 32, width: 749, height: 145 })
  .png({ compressionLevel: 9 })
  .toBuffer();
const mark = await sharp(source)
  .extract({ left: 24, top: 32, width: 207, height: 145 })
  .png({ compressionLevel: 9 })
  .toBuffer();

async function squareIcon(size, padding, transparent = false) {
  const available = Math.round(size * (1 - padding * 2));
  const artwork = await sharp(mark)
    .resize({ width: available, height: available, fit: "inside", withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const artworkMetadata = await sharp(artwork).metadata();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : background,
    },
  })
    .composite([{
      input: artwork,
      left: Math.round((size - artworkMetadata.width) / 2),
      top: Math.round((size - artworkMetadata.height) / 2),
    }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function brandedCanvas(width, height, artwork, targetWidth, railWidth) {
  const resized = await sharp(artwork)
    .resize({ width: targetWidth, height: Math.round(height * 0.72), fit: "inside", withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const resizedMetadata = await sharp(resized).metadata();
  const rail = await sharp({
    create: { width: railWidth, height, channels: 4, background: accent },
  }).png().toBuffer();

  return sharp({
    create: { width, height, channels: 4, background },
  })
    .composite([
      { input: rail, left: 0, top: 0 },
      {
        input: resized,
        left: Math.round((width - resizedMetadata.width) / 2),
        top: Math.round((height - resizedMetadata.height) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function ico(images) {
  const headerSize = 6 + images.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = headerSize;

  images.forEach(({ size, bytes }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(bytes.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += bytes.length;
  });

  return Buffer.concat([header, ...images.map(({ bytes }) => bytes)]);
}

const faviconFrames = await Promise.all([16, 32, 48, 64, 128, 256].map(async (size) => ({
  size,
  bytes: await squareIcon(size, 0.08, true),
})));

const outputs = new Map([
  ["assets/branding/streamtumi-logo.png", logo],
  ["assets/branding/streamtumi-mark.png", mark],
  ["app/favicon.ico", ico(faviconFrames)],
  ["public/branding/apple-touch-icon.png", await squareIcon(180, 0.12)],
  ["public/branding/icon-192.png", await squareIcon(192, 0.12)],
  ["public/branding/icon-512.png", await squareIcon(512, 0.12)],
  ["public/branding/icon-maskable-512.png", await squareIcon(512, 0.2)],
  ["public/branding/streamtumi-social.png", await brandedCanvas(1200, 630, logo, 1000, 32)],
  ["roku/images/streamtumi-logo.png", logo],
  ["roku/images/channel-poster_fhd.png", await brandedCanvas(540, 405, mark, 390, 14)],
  ["roku/images/channel-poster_hd.png", await brandedCanvas(336, 210, mark, 240, 9)],
  ["roku/images/splash_fhd.png", await brandedCanvas(1920, 1080, logo, 1200, 49)],
  ["roku/images/splash_hd.png", await brandedCanvas(1280, 720, logo, 800, 33)],
]);

const mismatches = [];
for (const [relativePath, bytes] of outputs) {
  const outputPath = path.join(root, relativePath);
  if (checkOnly) {
    try {
      const existing = await readFile(outputPath);
      if (!existing.equals(bytes)) mismatches.push(relativePath);
    } catch {
      mismatches.push(relativePath);
    }
    continue;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  console.log(`Generated ${relativePath}`);
}

if (mismatches.length > 0) {
  throw new Error(`Brand assets are missing or stale:\n${mismatches.map((item) => `- ${item}`).join("\n")}`);
}

if (checkOnly) console.log(`Verified ${outputs.size} generated brand assets.`);
