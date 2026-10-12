// PDF の各ページを PNG にする。print-panels.mjs から呼ぶ。
// 使い方: swift pdf-to-png.swift <in.pdf> <出力先> <dpi> <ページ 1 の名前> <ページ 2 の名前> ...
import AppKit
import PDFKit

let args = CommandLine.arguments
guard args.count >= 4, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  fatalError("usage: pdf-to-png.swift <in.pdf> <out-dir> <dpi> [names...]")
}
let outDir = URL(fileURLWithPath: args[2])
let scale = (Double(args[3]) ?? 300) / 72
let names = Array(args.dropFirst(4))

for i in 0..<doc.pageCount {
  guard let page = doc.page(at: i) else { continue }
  let box = page.bounds(for: .mediaBox)
  let w = Int((box.width * scale).rounded())
  let h = Int((box.height * scale).rounded())
  guard let ctx = CGContext(
    data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
  ) else { fatalError("page \(i + 1): could not create a bitmap context") }
  ctx.setFillColor(CGColor(gray: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.scaleBy(x: scale, y: scale)
  page.draw(with: .mediaBox, to: ctx)
  guard let image = ctx.makeImage() else { fatalError("page \(i + 1): could not render") }
  let rep = NSBitmapImageRep(cgImage: image)
  // 印刷時に 100% で出るよう、PNG にも解像度 (dpi) を書いておく
  rep.size = NSSize(width: box.width, height: box.height)
  let name = i < names.count ? names[i] : "page-\(i + 1)"
  let url = outDir.appendingPathComponent("\(name).png")
  try rep.representation(using: .png, properties: [:])!.write(to: url)
  print("png: \(url.lastPathComponent) \(w)×\(h)")
}
