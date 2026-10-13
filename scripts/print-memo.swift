// お題の三角紙を A4 1 枚に刷る PDF を書き出す。
// ゲームの PC の横にあるお題のメモ (iubeo/frontend/src/objects/pc/search/TaskMemo.tsx の paintMemo) を写し、
// お題の語のところにチーム名を入れる。日本語を埋め込むため、PDF は CoreText で描く (macOS のみ)。
//
// 使い方: swift print-memo.swift <出力 PDF> [お題の語]
//
// 紙は A4 縦。200 × 140 mm の面を上下に 2 面並べ、上の面は上下逆さに刷る。
// 真ん中の線で山折りにすると、表からも裏からも読める三角の卓上カードになる。
import AppKit

let args = CommandLine.arguments
guard args.count >= 2 else { fatalError("usage: print-memo.swift <out.pdf> [topic]") }
let outPath = args[1]
let topic = args.count >= 3 ? args[2] : "ゆーべお"

let PT = 72.0 / 25.4
let A4 = CGSize(width: 210, height: 297)

// メモの面 (mm)。ゲームのメモは 512 × 358 px で 200 × 140 mm なので、1 mm = 2.56 px
let FACE = CGSize(width: 200, height: 140)
let PX = 512.0 / FACE.width
func px(_ v: Double) -> Double { v / PX }

// ゲームと同じ色
let BORDER = NSColor(srgbRed: 0xd8 / 255, green: 0xd8 / 255, blue: 0xd4 / 255, alpha: 1)
let TEXT = NSColor(srgbRed: 0x1d / 255, green: 0x1d / 255, blue: 0x1f / 255, alpha: 1)
let SUB = NSColor(srgbRed: 0x6e / 255, green: 0x6e / 255, blue: 0x73 / 255, alpha: 1)
let MARK = NSColor.black

// 文字を、左端 x・縦の中心 cy (mm、上が 0) に置く。canvas の textBaseline = "middle" に合わせる
func text(_ s: String, font: NSFont, color: NSColor, x: Double, cy: Double, maxWidth: Double? = nil) {
  let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
  let str = NSAttributedString(string: s, attributes: attrs)
  let mid = (font.ascender + font.descender) / 2 // ベースラインから em の中心まで (pt)
  let baseline = cy * PT + mid
  str.draw(at: NSPoint(x: x * PT, y: baseline - font.ascender))
  _ = maxWidth
}

// お題の語は、幅に収まる最大のサイズ (96〜28 px) まで大きくする
func fitTopic(_ s: String) -> NSFont {
  var size = 96.0
  while size > 28 {
    let f = NSFont(name: "HiraginoSans-W6", size: px(size) * PT)!
    let w = NSAttributedString(string: s, attributes: [.font: f]).size().width / PT
    if w <= px(512 - 80) { return f }
    size -= 4
  }
  return NSFont(name: "HiraginoSans-W6", size: px(28) * PT)!
}

// 面を 1 枚描く。原点は面の左上 (mm)
func face(_ ctx: CGContext) {
  ctx.setFillColor(NSColor.white.cgColor)
  ctx.fill(CGRect(x: 0, y: 0, width: FACE.width * PT, height: FACE.height * PT))
  // ゲームは 6 px の線を、縁から 3 px 内側に引く (= 縁から 6 px の帯)
  ctx.setStrokeColor(BORDER.cgColor)
  ctx.setLineWidth(px(6) * PT)
  ctx.stroke(CGRect(x: px(3) * PT, y: px(3) * PT, width: (FACE.width - px(6)) * PT, height: (FACE.height - px(6)) * PT))
  text("お題", font: NSFont(name: "HiraginoSans-W6", size: px(34) * PT)!, color: TEXT, x: px(40), cy: px(56))
  if !topic.isEmpty {
    text(topic, font: fitTopic(topic), color: TEXT, x: px(40), cy: px(358 / 2 + 6))
  }
  text("Esc で離れる", font: NSFont(name: "HiraginoSans-W3", size: px(20) * PT)!, color: SUB, x: px(40), cy: px(358 - 40))
}

var box = CGRect(x: 0, y: 0, width: A4.width * PT, height: A4.height * PT)
guard let pdf = CGContext(URL(fileURLWithPath: outPath) as CFURL, mediaBox: &box, nil) else { fatalError("cannot create pdf") }
pdf.beginPDFPage(nil)
// 上が 0 の mm 座標で描けるよう、上下を反転する
pdf.translateBy(x: 0, y: A4.height * PT)
pdf.scaleBy(x: 1, y: -1)
NSGraphicsContext.current = NSGraphicsContext(cgContext: pdf, flipped: true)

let x0 = (A4.width - FACE.width) / 2
let fold = A4.height / 2
let top = fold - FACE.height

// 下の面 (表)
pdf.saveGState()
pdf.translateBy(x: x0 * PT, y: fold * PT)
face(pdf)
pdf.restoreGState()

// 上の面 (裏)。山折りしたとき読めるよう、180° 回す
pdf.saveGState()
pdf.translateBy(x: (x0 + FACE.width) * PT, y: fold * PT)
pdf.rotate(by: .pi)
face(pdf)
pdf.restoreGState()

// トンボ: 外周の切り線を余白に。折り線は破線
pdf.setStrokeColor(MARK.cgColor)
pdf.setLineWidth(0.12 * PT)
func line(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) {
  pdf.move(to: CGPoint(x: x1 * PT, y: y1 * PT))
  pdf.addLine(to: CGPoint(x: x2 * PT, y: y2 * PT))
  pdf.strokePath()
}
let bottom = fold + FACE.height
let gap = 1.5
let len = 4.0
for x in [x0, x0 + FACE.width] {
  line(x, top - gap, x, top - gap - len)
  line(x, bottom + gap, x, bottom + gap + len)
}
for y in [top, bottom] {
  line(x0 - gap, y, max(0.5, x0 - gap - len), y)
  line(x0 + FACE.width + gap, y, min(A4.width - 0.5, x0 + FACE.width + gap + len), y)
}
pdf.setLineDash(phase: 0, lengths: [1 * PT, 1 * PT])
line(x0 - gap, fold, max(0.5, x0 - gap - len), fold)
line(x0 + FACE.width + gap, fold, min(A4.width - 0.5, x0 + FACE.width + gap + len), fold)
pdf.setLineDash(phase: 0, lengths: [])

// 50 mm の目盛りとラベル (下の余白)。刷り上がりで測り、100% で刷れたか確かめる
let rx = A4.width - 14 - 50
let ry = 293.0
line(rx, ry, rx + 50, ry)
for i in 0...5 { line(rx + Double(i) * 10, ry, rx + Double(i) * 10, ry - (i % 5 == 0 ? 2.5 : 1.2)) }
let small = NSFont(name: "HiraginoSans-W3", size: 2.1 * PT)!
text("50 mm", font: small, color: SUB, x: rx + 52, cy: ry - 0.5)
text("IUBEO お題の三角紙 — A4 縦、100%（実際のサイズ）で刷る。トンボで切り、破線で山折り", font: small, color: SUB, x: 14, cy: ry - 0.5)

NSGraphicsContext.current = nil
pdf.endPDFPage()
pdf.closePDF()
print("pdf: \(outPath) (topic: \(topic))")
