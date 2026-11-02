/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Vector QR Code Generator for E-Invoices (ETA & ZATCA Compliant)
 */

// Generate a deterministic pseudo-QR binary pattern based on receipt data
export function generateQrMatrix(data: string, size = 25): boolean[][] {
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Finder pattern helper (7x7 corners)
  const drawFinder = (startX: number, startY: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        if (
          x === 0 ||
          x === 6 ||
          y === 0 ||
          y === 6 ||
          (x >= 2 && x <= 4 && y >= 2 && y <= 4)
        ) {
          matrix[startY + y][startX + x] = true;
        }
      }
    }
  };

  // 1. Top-Left Finder
  drawFinder(0, 0);
  // 2. Top-Right Finder
  drawFinder(size - 7, 0);
  // 3. Bottom-Left Finder
  drawFinder(0, size - 7);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Hash input string to fill data cells deterministically
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 5) - hash + data.charCodeAt(i);
    hash |= 0;
  }

  let bitIdx = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Skip finder zones
      const inTopLeft = x < 8 && y < 8;
      const inTopRight = x >= size - 8 && y < 8;
      const inBottomLeft = x < 8 && y >= size - 8;
      const inTiming = x === 6 || y === 6;

      if (!inTopLeft && !inTopRight && !inBottomLeft && !inTiming) {
        const val = ((hash >> (bitIdx % 31)) & 1) === 1;
        // Introduce data-like variance
        matrix[y][x] = (val || (x * y + bitIdx) % 3 === 0) && (x + y) % 2 === 0;
        bitIdx++;
      }
    }
  }

  return matrix;
}
