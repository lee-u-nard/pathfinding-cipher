interface Node {
  frequency: number;
  symbol?: number;
  left?: Node;
  right?: Node;
}

export interface CompressionResult {
  data: Uint8Array;
  originalSize: number;
  compressedSize: number;
  /** Compressed bytes divided by original UTF-8 bytes; null for empty input. */
  ratio: number | null;
}

// Insertion order breaks ties consistently for both encoding and decoding.
function buildTree(frequencies: number[]): Node | undefined {
  const nodes: Node[] = [];
  frequencies.forEach((frequency, symbol) => {
    if (frequency) nodes.push({ frequency, symbol });
  });
  while (nodes.length > 1) {
    nodes.sort((a, b) => a.frequency - b.frequency);
    const left = nodes.shift()!;
    const right = nodes.shift()!;
    nodes.push({ frequency: left.frequency + right.frequency, left, right });
  }
  return nodes[0];
}

/** Header: 16-bit symbol count, then [byte, 32-bit frequency] entries. */
export function compress(text: string): CompressionResult {
  const bytes = new TextEncoder().encode(text);
  const frequencies = new Array<number>(256).fill(0);
  for (const byte of bytes) frequencies[byte]!++;
  const tree = buildTree(frequencies);
  const codes = new Array<string>(256).fill("");
  const visit = (node: Node, code: string) => {
    if (node.symbol !== undefined) codes[node.symbol] = code || "0";
    else {
      visit(node.left!, code + "0");
      visit(node.right!, code + "1");
    }
  };
  if (tree) visit(tree, "");
  const symbolCount = frequencies.filter(Boolean).length;
  let bitLength = 0;
  for (let i = 0; i < 256; i++) bitLength += frequencies[i]! * codes[i]!.length;
  const headerSize = 2 + 5 * symbolCount;
  const data = new Uint8Array(headerSize + Math.ceil(bitLength / 8));
  const view = new DataView(data.buffer);
  view.setUint16(0, symbolCount);
  let offset = 2;
  frequencies.forEach((frequency, symbol) => {
    if (!frequency) return;
    data[offset] = symbol;
    view.setUint32(offset + 1, frequency);
    offset += 5;
  });
  let bit = 0;
  for (const byte of bytes) {
    for (const digit of codes[byte]!) {
      if (digit === "1") data[headerSize + Math.floor(bit / 8)]! |= 1 << (7 - (bit % 8));
      bit++;
    }
  }
  return {
    data,
    originalSize: bytes.length,
    compressedSize: data.length,
    ratio: bytes.length ? data.length / bytes.length : null,
  };
}

export function decompress(data: Uint8Array): string {
  if (data.length < 2) throw new Error("Invalid Huffman header");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = view.getUint16(0);
  const headerSize = 2 + count * 5;
  if (count > 256 || data.length < headerSize) throw new Error("Invalid Huffman header");
  const frequencies = new Array<number>(256).fill(0);
  let total = 0;
  for (let offset = 2; offset < headerSize; offset += 5) {
    const symbol = data[offset]!;
    const frequency = view.getUint32(offset + 1);
    if (!frequency || frequencies[symbol]) throw new Error("Invalid Huffman frequencies");
    frequencies[symbol] = frequency;
    total += frequency;
  }
  const tree = buildTree(frequencies);
  if (!tree) {
    if (data.length !== 2) throw new Error("Invalid empty Huffman data");
    return "";
  }
  // Every encoded symbol uses at least one bit, including a one-symbol tree.
  if (total > (data.length - headerSize) * 8) throw new Error("Truncated Huffman data");
  const output = new Uint8Array(total);
  let node = tree;
  let written = 0;
  for (let bit = 0; bit < (data.length - headerSize) * 8 && written < total; bit++) {
    const value = (data[headerSize + Math.floor(bit / 8)]! >> (7 - (bit % 8))) & 1;
    if (tree.symbol !== undefined) {
      if (value !== 0) throw new Error("Invalid Huffman data");
      output[written++] = tree.symbol;
    } else {
      node = (value ? node.right : node.left)!;
      if (node.symbol !== undefined) {
        output[written++] = node.symbol;
        node = tree;
      }
    }
  }
  if (written !== total) throw new Error("Truncated Huffman data");
  return new TextDecoder("utf-8", { fatal: true }).decode(output);
}

/** Header: ASCII "RL", then run-length width (1 or 2 bytes). Each run stores
 * its unsigned little-endian count followed by one UTF-8 byte. */
export function rleCompress(text: string, countBytes: 1 | 2 = 1): CompressionResult {
  const bytes = new TextEncoder().encode(text);
  const output: number[] = [0x52, 0x4c, countBytes];
  const maxRun = countBytes === 1 ? 255 : 65535;
  for (let i = 0; i < bytes.length;) {
    const symbol = bytes[i]!;
    let count = 1;
    while (count < maxRun && i + count < bytes.length && bytes[i + count] === symbol) count++;
    output.push(count & 0xff);
    if (countBytes === 2) output.push(count >> 8);
    output.push(symbol);
    i += count;
  }
  const data = Uint8Array.from(output);
  return {
    data,
    originalSize: bytes.length,
    compressedSize: data.length,
    ratio: bytes.length ? data.length / bytes.length : null,
  };
}

export function rleDecompress(data: Uint8Array): string {
  if (data.length < 3 || data[0] !== 0x52 || data[1] !== 0x4c) {
    throw new Error("Invalid RLE header");
  }
  const countBytes = data[2];
  if (countBytes !== 1 && countBytes !== 2) throw new Error("Invalid RLE run width");
  if ((data.length - 3) % (countBytes + 1) !== 0) throw new Error("Truncated RLE data");
  let decodedSize = 0;
  for (let i = 3; i < data.length; i += countBytes + 1) {
    const count = data[i]! + (countBytes === 2 ? data[i + 1]! * 256 : 0);
    if (!count) throw new Error("Invalid RLE run length");
    decodedSize += count;
  }
  const output = new Uint8Array(decodedSize);
  let offset = 0;
  for (let i = 3; i < data.length; i += countBytes + 1) {
    const count = data[i]! + (countBytes === 2 ? data[i + 1]! * 256 : 0);
    output.fill(data[i + countBytes]!, offset, offset + count);
    offset += count;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(output);
}
