import * as zlib from 'zlib';

interface ZipFileEntry {
  name: string;
  data: string | Buffer;
}

// Precomputed CRC32 lookup table
const CRC32_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[n] = c >>> 0;
}

export function calculateCrc32(buf: Buffer): number {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

export function buildZip(files: ZipFileEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  // Valid MS-DOS date: 1980-01-01 (0x0021), time 00:00:00 (0x0000)
  // DOS date 0 is invalid and triggers archive corruption warnings in Windows/Excel.
  const DOS_DATE = 0x0021;
  const DOS_TIME = 0x0000;

  for (const file of files) {
    const filenameBuf = Buffer.from(file.name, 'utf8');
    const dataBuf = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    const crc = calculateCrc32(dataBuf);
    const compressed = zlib.deflateRawSync(dataBuf);

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30 + filenameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature PK\x03\x04
    localHeader.writeUInt16LE(20, 4); // version needed 2.0
    localHeader.writeUInt16LE(0, 6); // general purpose bit flag
    localHeader.writeUInt16LE(8, 8); // compression method (deflate)
    localHeader.writeUInt16LE(DOS_TIME, 10); // last mod file time
    localHeader.writeUInt16LE(DOS_DATE, 12); // last mod file date (1980-01-01)
    localHeader.writeUInt32LE(crc, 14); // crc-32
    localHeader.writeUInt32LE(compressed.length, 18); // compressed size
    localHeader.writeUInt32LE(dataBuf.length, 22); // uncompressed size
    localHeader.writeUInt16LE(filenameBuf.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28); // extra field length
    filenameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, compressed);

    // Central directory header (46 bytes + filename)
    const cdHeader = Buffer.alloc(46 + filenameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0); // signature PK\x01\x02
    cdHeader.writeUInt16LE(20, 4); // version made by: 2.0 (MS-DOS)
    cdHeader.writeUInt16LE(20, 6); // version needed: 2.0
    cdHeader.writeUInt16LE(0, 8); // flags
    cdHeader.writeUInt16LE(8, 10); // compression method: deflate
    cdHeader.writeUInt16LE(DOS_TIME, 12); // mod time
    cdHeader.writeUInt16LE(DOS_DATE, 14); // mod date
    cdHeader.writeUInt32LE(crc, 16); // crc-32
    cdHeader.writeUInt32LE(compressed.length, 20); // compressed size
    cdHeader.writeUInt32LE(dataBuf.length, 24); // uncompressed size
    cdHeader.writeUInt16LE(filenameBuf.length, 28); // file name length
    cdHeader.writeUInt16LE(0, 30); // extra field length
    cdHeader.writeUInt16LE(0, 32); // file comment length
    cdHeader.writeUInt16LE(0, 34); // disk number start
    cdHeader.writeUInt16LE(0, 36); // internal file attributes
    cdHeader.writeUInt32LE(0x00000020, 38); // external file attributes (DOS archive)
    cdHeader.writeUInt32LE(offset, 42); // relative offset of local header
    filenameBuf.copy(cdHeader, 46);

    centralHeaders.push(cdHeader);
    offset += localHeader.length + compressed.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const h of centralHeaders) cdSize += h.length;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature PK\x05\x06
  eocd.writeUInt16LE(0, 4); // number of this disk
  eocd.writeUInt16LE(0, 6); // disk where central directory starts
  eocd.writeUInt16LE(files.length, 8); // number of central directory records on this disk
  eocd.writeUInt16LE(files.length, 10); // total number of central directory records
  eocd.writeUInt32LE(cdSize, 12); // size of central directory
  eocd.writeUInt32LE(cdOffset, 16); // offset of start of central directory
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

function escapeXml(str: string): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function getColumnLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export function generateSimpleXlsx(
  sheetName: string,
  columns: string[],
  rows: Array<Array<string | number>>
): Buffer {
  // Shared strings collection to strictly comply with Excel OpenXML specifications
  const stringMap = new Map<string, number>();
  const sharedStrings: string[] = [];
  let totalStringCount = 0;

  function getStringId(val: string): number {
    totalStringCount++;
    const s = String(val);
    if (stringMap.has(s)) {
      return stringMap.get(s)!;
    }
    const id = sharedStrings.length;
    stringMap.set(s, id);
    sharedStrings.push(s);
    return id;
  }

  const numCols = columns.length;
  const numRows = rows.length + 1; // 1 header row + N data rows
  const lastColLetter = getColumnLetter(Math.max(0, numCols - 1));
  const dimensionRef = `A1:${lastColLetter}${Math.max(1, numRows)}`;

  let sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  sheetXml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n';
  sheetXml += `  <dimension ref="${dimensionRef}"/>\n`;
  sheetXml += '  <sheetViews>\n';
  sheetXml += '    <sheetView tabSelected="1" workbookViewId="0"/>\n';
  sheetXml += '  </sheetViews>\n';
  sheetXml += '  <sheetFormatPr defaultRowHeight="15"/>\n';
  sheetXml += '  <sheetData>\n';

  // Row 1: Headers
  sheetXml += '    <row r="1">\n';
  columns.forEach((colName, idx) => {
    const colLetter = getColumnLetter(idx);
    const sid = getStringId(colName);
    sheetXml += `      <c r="${colLetter}1" t="s"><v>${sid}</v></c>\n`;
  });
  sheetXml += '    </row>\n';

  // Rows 2..N: Data
  rows.forEach((row, rowIdx) => {
    const rNum = rowIdx + 2;
    sheetXml += `    <row r="${rNum}">\n`;
    row.forEach((val, colIdx) => {
      const colLetter = getColumnLetter(colIdx);
      if (typeof val === 'number') {
        sheetXml += `      <c r="${colLetter}${rNum}"><v>${val}</v></c>\n`;
      } else {
        const strVal = val === null || val === undefined ? '' : String(val);
        const sid = getStringId(strVal);
        sheetXml += `      <c r="${colLetter}${rNum}" t="s"><v>${sid}</v></c>\n`;
      }
    });
    sheetXml += '    </row>\n';
  });

  sheetXml += '  </sheetData>\n';
  sheetXml += '  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>\n';
  sheetXml += '</worksheet>';

  // Build sharedStrings.xml
  let sharedStringsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  sharedStringsXml += `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${totalStringCount}" uniqueCount="${sharedStrings.length}">\n`;
  for (const s of sharedStrings) {
    sharedStringsXml += `  <si><t>${escapeXml(s)}</t></si>\n`;
  }
  sharedStringsXml += '</sst>';

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <workbookPr date1904="false"/>
  <bookViews>
    <workbookView xWindow="0" yWindow="0" windowWidth="20480" windowHeight="10240"/>
  </bookViews>
  <sheets>
    <sheet name="${escapeXml(sheetName || 'Sheet1')}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1">
    <font>
      <sz val="11"/>
      <name val="Calibri"/>
    </font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;

  return buildZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/styles.xml', data: styles },
    { name: 'xl/sharedStrings.xml', data: sharedStringsXml },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml },
  ]);
}
