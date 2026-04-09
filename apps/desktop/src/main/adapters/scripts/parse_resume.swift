import AppKit
import Foundation
import PDFKit
import Vision

struct BlockBBox: Codable {
    let left: Double
    let top: Double
    let width: Double
    let height: Double
}

struct PageSummary: Codable {
    let pageNumber: Int
    let text: String?
    let charCount: Int
    let parserKinds: [String]
    let usedOcr: Bool
}

struct BlockSummary: Codable {
    let id: String
    let pageNumber: Int
    let readingOrder: Int
    let text: String
    let kind: String
    let sectionHint: String
    let bbox: BlockBBox?
    let sourceParserKinds: [String]
    let sourceConfidence: Double?
}

struct BundleOutput: Codable {
    let id: String
    let runId: String
    let sourceResumeId: String
    let sourceFileKind: String
    let primaryParserKind: String
    let parserKinds: [String]
    let createdAt: String
    let languageHints: [String]
    let warnings: [String]
    let pages: [PageSummary]
    let blocks: [BlockSummary]
    let fullText: String?
}

struct RecognizedLine {
    let text: String
    let bbox: BlockBBox?
    let confidence: Double?
}

func cleanLine(_ value: String) -> String {
    value
        .replacingOccurrences(of: "\u{0}", with: " ")
        .replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\n", with: " ")
        .replacingOccurrences(of: "\t", with: " ")
        .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

func classifyBlockKind(_ text: String) -> String {
    if text.contains("@") || text.contains("linkedin.com") || text.contains("github.com") {
        return "contact"
    }

    if text == text.uppercased(), text.count <= 48 {
        return "heading"
    }

    if text.hasPrefix("-") || text.hasPrefix("•") {
        return "list_item"
    }

    return "paragraph"
}

func classifySectionHint(_ text: String) -> String {
    let lowercased = text.lowercased()
    if lowercased.contains("experience") || lowercased.contains("employment") {
        return "experience"
    }
    if lowercased.contains("education") || lowercased.contains("university") || lowercased.contains("degree") {
        return "education"
    }
    if lowercased.contains("certification") || lowercased.contains("certificate") {
        return "certifications"
    }
    if lowercased.contains("skill") || lowercased.contains("react") || lowercased.contains("typescript") {
        return "skills"
    }
    if lowercased.contains("project") || lowercased.contains("portfolio") {
        return "projects"
    }
    if lowercased.contains("language") || lowercased.contains("english") {
        return "languages"
    }
    if lowercased.contains("@") || lowercased.contains("linkedin.com") || lowercased.contains("github.com") || lowercased.contains("phone") {
        return "contact"
    }
    if text == text.uppercased() || text.count <= 80 {
        return "identity"
    }
    if text.count >= 48 {
        return "summary"
    }
    return "other"
}

func recognizedLinesFromText(_ text: String) -> [RecognizedLine] {
    text
        .components(separatedBy: .newlines)
        .map(cleanLine)
        .filter { !$0.isEmpty }
        .enumerated()
        .map { _, line in RecognizedLine(text: line, bbox: nil, confidence: 1) }
}

func recognizedLinesFromOcr(page: PDFPage) throws -> [RecognizedLine] {
    let pageRect = page.bounds(for: .mediaBox)
    let thumbnail = page.thumbnail(of: NSSize(width: pageRect.width * 2, height: pageRect.height * 2), for: .mediaBox)
    guard let cgImage = thumbnail.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        return []
    }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])

    let observations = (request.results ?? []) as [VNRecognizedTextObservation]
    return observations.compactMap { observation in
        guard let topCandidate = observation.topCandidates(1).first else {
            return nil
        }

        let text = cleanLine(topCandidate.string)
        guard !text.isEmpty else {
            return nil
        }

        let box = observation.boundingBox
        return RecognizedLine(
            text: text,
            bbox: BlockBBox(
                left: Double(box.origin.x) * Double(pageRect.width),
                top: Double(1 - box.origin.y - box.size.height) * Double(pageRect.height),
                width: Double(box.size.width) * Double(pageRect.width),
                height: Double(box.size.height) * Double(pageRect.height)
            ),
            confidence: Double(topCandidate.confidence)
        )
    }
    .sorted { left, right in
        let leftTop = left.bbox?.top ?? 0
        let rightTop = right.bbox?.top ?? 0
        if abs(leftTop - rightTop) > 6 {
            return leftTop < rightTop
        }
        return (left.bbox?.left ?? 0) < (right.bbox?.left ?? 0)
    }
}

let arguments = CommandLine.arguments
guard arguments.count >= 5 else {
    fputs("Expected filePath, bundleId, runId, and sourceResumeId arguments.\n", stderr)
    exit(1)
}

let filePath = arguments[1]
let bundleId = arguments[2]
let runId = arguments[3]
let sourceResumeId = arguments[4]
let fileUrl = URL(fileURLWithPath: filePath)

guard let document = PDFDocument(url: fileUrl) else {
    fputs("Unable to open PDF document.\n", stderr)
    exit(1)
}

var parserKinds = Set<String>()
var warnings: [String] = []
var pages: [PageSummary] = []
var blocks: [BlockSummary] = []
var pageTexts: [String] = []

for pageIndex in 0..<document.pageCount {
    guard let page = document.page(at: pageIndex) else {
        continue
    }

    let nativeText = cleanLine(page.string ?? "")
    let useOcr = nativeText.count < 40
    let pageParserKind = useOcr ? "macos_vision_ocr" : "macos_pdfkit_text"
    parserKinds.insert(pageParserKind)

    let lines: [RecognizedLine]
    if useOcr {
        do {
            lines = try recognizedLinesFromOcr(page: page)
        } catch {
            warnings.append("Vision OCR failed on page \(pageIndex + 1): \(error.localizedDescription)")
            lines = recognizedLinesFromText(nativeText)
        }
    } else {
        lines = recognizedLinesFromText(nativeText)
    }

    let pageText = lines.map { $0.text }.joined(separator: "\n")
    let cleanedPageText = cleanLine(pageText.replacingOccurrences(of: "\n", with: " "))
    if !cleanedPageText.isEmpty {
        pageTexts.append(pageText)
    }

    pages.append(
        PageSummary(
            pageNumber: pageIndex + 1,
            text: pageText.isEmpty ? nil : pageText,
            charCount: pageText.count,
            parserKinds: [pageParserKind],
            usedOcr: useOcr
        )
    )

    for (lineIndex, line) in lines.enumerated() {
        blocks.append(
            BlockSummary(
                id: "page_\(pageIndex + 1)_block_\(lineIndex + 1)",
                pageNumber: pageIndex + 1,
                readingOrder: lineIndex,
                text: line.text,
                kind: classifyBlockKind(line.text),
                sectionHint: classifySectionHint(line.text),
                bbox: line.bbox,
                sourceParserKinds: [pageParserKind],
                sourceConfidence: line.confidence
            )
        )
    }
}

let parserKindsArray = Array(parserKinds).sorted()
let fullText = pageTexts.joined(separator: "\n\n").trimmingCharacters(in: .whitespacesAndNewlines)
let output = BundleOutput(
    id: bundleId,
    runId: runId,
    sourceResumeId: sourceResumeId,
    sourceFileKind: "pdf",
    primaryParserKind: parserKinds.contains("macos_vision_ocr") ? "macos_vision_ocr" : "macos_pdfkit_text",
    parserKinds: parserKindsArray.isEmpty ? ["macos_pdfkit_text"] : parserKindsArray,
    createdAt: ISO8601DateFormatter().string(from: Date()),
    languageHints: [],
    warnings: warnings,
    pages: pages,
    blocks: blocks,
    fullText: fullText.isEmpty ? nil : fullText
)

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
let data = try encoder.encode(output)
FileHandle.standardOutput.write(data)
