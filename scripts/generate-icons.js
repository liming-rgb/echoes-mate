// Generate PWA icons from SVG using sharp
const sharp = require("sharp")
const path = require("path")
const fs = require("fs")

const svgPath = path.join(__dirname, "..", "app", "icon.svg")
const outDir = path.join(__dirname, "..", "public", "icons")

const sizes = [192, 512]

async function main() {
  const svg = fs.readFileSync(svgPath)

  for (const size of sizes) {
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(path.join(outDir, `icon-${size}.png`))
    console.log(`✓ Generated icon-${size}.png`)
  }

  console.log("Done!")
}

main().catch((err) => {
  console.error("Failed:", err.message)
  process.exit(1)
})
