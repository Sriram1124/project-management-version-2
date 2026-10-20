import * as zlib from 'zlib';

interface ZipFileEntry {
  name: string;
  data: string | Buffer;
}

export function buildZip(files: ZipFileEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const filenameBuf = Buffer.from(file.name, 'utf8');
    const dataBuf = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    const crc = (zlib as any).crc32 ? (zlib as any).crc32(dataBuf) : 0;
    const compressed = zlib.deflateRawSync(dataBuf);

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30 + filenameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature PK\x03\x04
    localHeader.writeUInt16LE(20, 4); // version needed 2.0
    localHeader.writeUInt16LE(0, 6); // general purpose bit flag
    localHeader.writeUInt16LE(8, 8); // compression method (deflate)
    localHeader.writeUInt16LE(0, 10); // last mod file time
    localHeader.writeUInt16LE(0, 12); // last mod file date
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
    cdHeader.writeUInt16LE(20, 4); // version made by
    cdHeader.writeUInt16LE(20, 6); // version needed
    cdHeader.writeUInt16LE(0, 8); // flags
    cdHeader.writeUInt16LE(8, 10); // compression method
    cdHeader.writeUInt16LE(0, 12); // mod time
    cdHeader.writeUInt16LE(0, 14); // mod date
    cdHeader.writeUInt32LE(crc, 16); // crc-32
    cdHeader.writeUInt32LE(compressed.length, 20); // compressed size
    cdHeader.writeUInt32LE(dataBuf.length, 24); // uncompressed size
    cdHeader.writeUInt16LE(filenameBuf.length, 28); // file name length
    cdHeader.writeUInt16LE(0, 30); // extra field length
    cdHeader.writeUInt16LE(0, 32); // file comment length
    cdHeader.writeUInt16LE(0, 34); // disk number start
    cdHeader.writeUInt16LE(0, 36); // internal file attributes
    cdHeader.writeUInt32LE(0, 38); // external file attributes
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
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateSimpleXlsx(
  sheetName: string,
  columns: string[],
  rows: Array<Array<string | number>>
): Buffer {
  let sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  sheetXml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n';
  sheetXml += '  <sheetData>\n';

  // Row 1: Headers
  sheetXml += '    <row r="1">\n';
  columns.forEach((colName, idx) => {
    const colLetter = String.fromCharCode(65 + idx);
    sheetXml += `      <c r="${colLetter}1" t="inlineStr"><is><t>${escapeXml(colName)}</t></is></c>\n`;
  });
  sheetXml += '    </row>\n';

  // Rows 2..N: Data
  rows.forEach((row, rowIdx) => {
    const rNum = rowIdx + 2;
    sheetXml += `    <row r="${rNum}">\n`;
    row.forEach((val, colIdx) => {
      const colLetter = String.fromCharCode(65 + colIdx);
      if (typeof val === 'number') {
        sheetXml += `      <c r="${colLetter}${rNum}"><v>${val}</v></c>\n`;
      } else {
        const strVal = val === null || val === undefined ? '' : String(val);
        sheetXml += `      <c r="${colLetter}${rNum}" t="inlineStr"><is><t>${escapeXml(strVal)}</t></is></c>\n`;
      }
    });
    sheetXml += '    </row>\n';
  });

  sheetXml += '  </sheetData>\n';
  sheetXml += '</worksheet>';

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName || 'Sheet1')}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
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
</styleSheet>`;

  return buildZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/styles.xml', data: styles },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml },
  ]);
}
