// Generate PWA icons from SVG using sharp
const sharp = require("sharp")
const path = require("path")
const fs = require("fs")

const svgPath = path.join(__dirname, "..", "app", "icon.svg")
const outDir = path.join(__dirname, "..", "public", "icons")

const sizes = [192, 512]
const PADDING_RATIO = 0.15 // 15% padding on each side → design occupies 70% of canvas

async function main() {
  const svgBuffer = fs.readFileSync(svgPath)

  for (const size of sizes) {
    const designSize = Math.round(size * (1 - PADDING_RATIO * 2))
    const offset = Math.round(size * PADDING_RATIO)

    // Render the SVG (circle design) at the smaller design size
    const designPng = await sharp(svgBuffer)
      .resize(designSize, designSize)
      .png()
      .toBuffer()

    // Create a full-size purple canvas and place the scaled design on top
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 3,
        background: { r: 99, g: 102, b: 241 }, // #6366f1
      },
    })
      .composite([{ input: designPng, top: offset, left: offset }])
      .png()
      .toFile(path.join(outDir, `icon-${size}.png`))

    console.log(`✓ Generated icon-${size}.png (design ${designSize}px centered in ${size}px)`)
  }

  console.log("Done!")
}

main().catch((err) => {
  console.error("Failed:", err.message)
  process.exit(1)
})
