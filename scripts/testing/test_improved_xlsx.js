const zlib = require('zlib');
const fs = require('fs');

// Precomputed CRC32 table
const CRC32_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[n] = c >>> 0;
}

function calculateCrc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getColumnLetter(colIndex) {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

function buildZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  // Valid MS-DOS date: 1980-01-01 (0x0021)
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
    localHeader.writeUInt16LE(20, 4); // version needed: 2.0
    localHeader.writeUInt16LE(0, 6); // general purpose bit flag
    localHeader.writeUInt16LE(8, 8); // compression: deflate
    localHeader.writeUInt16LE(DOS_TIME, 10); // mod time
    localHeader.writeUInt16LE(DOS_DATE, 12); // mod date (valid 1980-01-01)
    localHeader.writeUInt32LE(crc, 14); // crc-32
    localHeader.writeUInt32LE(compressed.length, 18); // compressed size
    localHeader.writeUInt32LE(dataBuf.length, 22); // uncompressed size
    localHeader.writeUInt16LE(filenameBuf.length, 26); // filename length
    localHeader.writeUInt16LE(0, 28); // extra field length
    filenameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, compressed);

    // Central directory header (46 bytes + filename)
    const cdHeader = Buffer.alloc(46 + filenameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0); // signature PK\x01\x02
    cdHeader.writeUInt16LE(20, 4); // version made by: 2.0
    cdHeader.writeUInt16LE(20, 6); // version needed: 2.0
    cdHeader.writeUInt16LE(0, 8); // flags
    cdHeader.writeUInt16LE(8, 10); // compression: deflate
    cdHeader.writeUInt16LE(DOS_TIME, 12); // mod time
    cdHeader.writeUInt16LE(DOS_DATE, 14); // mod date
    cdHeader.writeUInt32LE(crc, 16); // crc-32
    cdHeader.writeUInt32LE(compressed.length, 20); // compressed size
    cdHeader.writeUInt32LE(dataBuf.length, 24); // uncompressed size
    cdHeader.writeUInt16LE(filenameBuf.length, 28); // filename length
    cdHeader.writeUInt16LE(0, 30); // extra field length
    cdHeader.writeUInt16LE(0, 32); // comment length
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

  // End of central directory (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature PK\x05\x06
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk where CD starts
  eocd.writeUInt16LE(files.length, 8); // entries on disk
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(cdSize, 12); // CD size
  eocd.writeUInt32LE(cdOffset, 16); // CD offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

function generateSimpleXlsx(sheetName, columns, rows) {
  // Shared strings collection
  const stringMap = new Map();
  const sharedStrings = [];
  let totalStringCount = 0;

  function getStringId(str) {
    totalStringCount++;
    const s = String(str);
    if (stringMap.has(s)) {
      return stringMap.get(s);
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

const buf = generateSimpleXlsx('Overdue Forms', ['Name', 'Mail', 'Days Passed'], [
  ['Alice Intern', 'alice@example.com', 5],
  ['Bob Intern', 'bob@example.com', 2]
]);
fs.writeFileSync('improved_overdue.xlsx', buf);
console.log('Successfully written improved_overdue.xlsx, size:', buf.length);

