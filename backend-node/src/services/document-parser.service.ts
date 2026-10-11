import fs from 'fs';
import path from 'path';

export interface ExtractedRequirement {
  code?: string;
  title: string;
  description?: string;
  section?: string;
}

export class DocumentParserService {
  /**
   * Extract raw text from file buffer based on extension
   */
  static async extractText(filePath: string, ext: string, buffer?: Buffer): Promise<string> {
    const fileExt = ext.toLowerCase().replace('.', '');
    const dataBuffer = buffer || (fs.existsSync(filePath) ? await fs.promises.readFile(filePath) : null);

    if (!dataBuffer) {
      throw new Error(`File buffer not available at ${filePath}`);
    }

    if (fileExt === 'txt' || fileExt === 'md' || fileExt === 'markdown' || fileExt === 'brd') {
      return dataBuffer.toString('utf-8');
    }

    if (fileExt === 'pdf') {
      try {
        const pdfParseModule = await import('pdf-parse');
        const pdfParse = (pdfParseModule as any).default || pdfParseModule;
        const pdfData = await pdfParse(dataBuffer);
        return pdfData.text || '';
      } catch (err: any) {
        console.error('Failed to parse PDF document:', err.message);
        return '';
      }
    }

    if (fileExt === 'docx') {
      try {
        const mammothModule = await import('mammoth');
        const mammoth = (mammothModule as any).default || mammothModule;
        const result = await mammoth.extractRawText({ buffer: dataBuffer });
        return result.value || '';
      } catch (err: any) {
        console.error('Failed to parse DOCX document:', err.message);
        return '';
      }
    }

    // Unsupported for text parsing (e.g. images, binaries)
    return '';
  }

  /**
   * Parse extracted raw text to identify actionable requirements/items
   */
  static extractRequirements(rawText: string): ExtractedRequirement[] {
    if (!rawText || !rawText.trim()) return [];

    const requirements: ExtractedRequirement[] = [];
    const lines = rawText.split(/\r?\n/);

    let currentSection = 'General Requirements';
    let reqIndex = 1;

    // Regex patterns for detecting sections, headers, and requirement items
    const headerPattern = /^(?:#{1,4}\s+|(?:\d+\.|\bPhase\b|\bSection\b)\s+)(.+)$/i;
    const reqCodePattern = /^(?:\[?(?:REQ|FR|NFR|TASK|FEAT|BRD|AC)-\d+\]?|[-*•]\s+\[?(?:REQ|FR|NFR|TASK|FEAT)-\d+\]?|\d+\.\d+)\s*:?\s*(.+)$/i;
    const bulletPattern = /^[-*•]\s+(?:\[[\sxX]\]\s+)?(.+)$/;
    const numberedPattern = /^(?:\d+)\.\s+(.+)$/;
    const actionableKeywordPattern = /^(?:Must|Shall|Should|Implement|Create|Build|Ensure|Provide|Support|Add|Verify|Allow|Enable|Configure|Integrate|Track|Display)\b/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Check if it's a section header
      const headerMatch = line.match(headerPattern);
      if (headerMatch && line.length < 80) {
        currentSection = headerMatch[1].replace(/^[#\s]+/, '').trim();
        continue;
      }

      // Check if line is an explicit requirement code (e.g. "REQ-101: User Authentication" or "1.1 Project Creation")
      const codeMatch = line.match(reqCodePattern);
      if (codeMatch) {
        const itemText = codeMatch[1].trim();
        if (itemText.length > 5) {
          const codeCandidate = line.split(/[:\s]/)[0].replace(/[\[\]]/g, '');
          requirements.push({
            code: codeCandidate.length <= 15 ? codeCandidate : `REQ-${reqIndex++}`,
            title: itemText.slice(0, 150),
            description: itemText,
            section: currentSection,
          });
          continue;
        }
      }

      // Check if it's a markdown task list or bullet with actionable intent
      const bulletMatch = line.match(bulletPattern);
      if (bulletMatch) {
        const itemText = bulletMatch[1].trim();
        // If actionable or starts with strong requirement phrasing
        if (itemText.length >= 10 && (actionableKeywordPattern.test(itemText) || itemText.includes('must') || itemText.includes('should') || currentSection.toLowerCase().includes('requirement') || currentSection.toLowerCase().includes('audit') || currentSection.toLowerCase().includes('feature') || currentSection.toLowerCase().includes('phase'))) {
          requirements.push({
            code: `REQ-${reqIndex++}`,
            title: itemText.slice(0, 150),
            description: itemText,
            section: currentSection,
          });
          continue;
        }
      }

      // Check if numbered list item
      const numMatch = line.match(numberedPattern);
      if (numMatch && !headerMatch) {
        const itemText = numMatch[1].trim();
        if (itemText.length >= 10 && (actionableKeywordPattern.test(itemText) || currentSection.toLowerCase().includes('requirement') || currentSection.toLowerCase().includes('task') || currentSection.toLowerCase().includes('scope') || currentSection.toLowerCase().includes('action'))) {
          requirements.push({
            code: `REQ-${reqIndex++}`,
            title: itemText.slice(0, 150),
            description: itemText,
            section: currentSection,
          });
          continue;
        }
      }
    }

    // Limit to reasonable maximum to prevent DOS on giant arbitrary logs
    return requirements.slice(0, 50);
  }
}

