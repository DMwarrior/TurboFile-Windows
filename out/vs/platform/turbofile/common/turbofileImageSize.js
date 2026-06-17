function getTurboFileImageSizeFromHeader(data) {
  return getJpegImageSize(data) ?? getPngImageSize(data) ?? getGifImageSize(data) ?? getBmpImageSizeFromHeader(data) ?? getWebpImageSize(data);
}
function getJpegImageSize(data) {
  if (data.byteLength < 4 || data[0] !== 255 || data[1] !== 216) {
    return void 0;
  }
  const startOfFrameMarkers = /* @__PURE__ */ new Set([
    192,
    193,
    194,
    195,
    197,
    198,
    199,
    201,
    202,
    203,
    205,
    206,
    207
  ]);
  let offset = 2;
  while (offset + 1 < data.byteLength) {
    if (data[offset] !== 255) {
      offset++;
      continue;
    }
    while (offset < data.byteLength && data[offset] === 255) {
      offset++;
    }
    if (offset >= data.byteLength) {
      break;
    }
    const marker = data[offset++];
    if (marker === 216 || marker === 217) {
      continue;
    }
    if (marker === 218 || offset + 2 > data.byteLength) {
      break;
    }
    const segmentLength = readUint16BE(data, offset);
    offset += 2;
    if (segmentLength < 2) {
      break;
    }
    if (startOfFrameMarkers.has(marker)) {
      if (offset + 5 > data.byteLength) {
        break;
      }
      return positiveSize(readUint16BE(data, offset + 3), readUint16BE(data, offset + 1));
    }
    offset += segmentLength - 2;
  }
  return void 0;
}
function getPngImageSize(data) {
  if (data.byteLength < 24 || data[0] !== 137 || data[1] !== 80 || data[2] !== 78 || data[3] !== 71 || data[4] !== 13 || data[5] !== 10 || data[6] !== 26 || data[7] !== 10) {
    return void 0;
  }
  return positiveSize(readUint32BE(data, 16), readUint32BE(data, 20));
}
function getGifImageSize(data) {
  if (data.byteLength < 10 || !matchesAscii(data, 0, "GIF87a") && !matchesAscii(data, 0, "GIF89a")) {
    return void 0;
  }
  return positiveSize(readUint16LE(data, 6), readUint16LE(data, 8));
}
function getBmpImageSizeFromHeader(data) {
  if (data.byteLength < 26 || data[0] !== 66 || data[1] !== 77) {
    return void 0;
  }
  const headerSize = readUint32LE(data, 14);
  if (headerSize === 12) {
    if (data.byteLength < 22) {
      return void 0;
    }
    return positiveSize(readUint16LE(data, 18), readUint16LE(data, 20));
  }
  if (headerSize < 12) {
    return void 0;
  }
  return positiveSize(Math.abs(readInt32LE(data, 18)), Math.abs(readInt32LE(data, 22)));
}
function getWebpImageSize(data) {
  if (data.byteLength < 26 || !matchesAscii(data, 0, "RIFF") || !matchesAscii(data, 8, "WEBP")) {
    return void 0;
  }
  if (matchesAscii(data, 12, "VP8X")) {
    if (data.byteLength < 30) {
      return void 0;
    }
    return positiveSize(readUint24LE(data, 24) + 1, readUint24LE(data, 27) + 1);
  }
  if (matchesAscii(data, 12, "VP8L")) {
    if (data.byteLength < 25 || data[20] !== 47) {
      return void 0;
    }
    const b0 = data[21];
    const b1 = data[22];
    const b2 = data[23];
    const b3 = data[24];
    const width = 1 + ((b1 & 63) << 8 | b0);
    const height = 1 + ((b3 & 15) << 10 | b2 << 2 | (b1 & 192) >> 6);
    return positiveSize(width, height);
  }
  if (!matchesAscii(data, 12, "VP8 ")) {
    return void 0;
  }
  const chunkStart = 20;
  const searchEnd = Math.min(data.byteLength - 4, chunkStart + 16);
  for (let offset = chunkStart; offset <= searchEnd; offset++) {
    if (data[offset] === 157 && data[offset + 1] === 1 && data[offset + 2] === 42) {
      return positiveSize(readUint16LE(data, offset + 3) & 16383, readUint16LE(data, offset + 5) & 16383);
    }
  }
  return void 0;
}
function positiveSize(width, height) {
  return width > 0 && height > 0 ? { width, height } : void 0;
}
function matchesAscii(data, offset, text) {
  if (offset + text.length > data.byteLength) {
    return false;
  }
  for (let index = 0; index < text.length; index++) {
    if (data[offset + index] !== text.charCodeAt(index)) {
      return false;
    }
  }
  return true;
}
function readUint16BE(data, offset) {
  return data[offset] << 8 | data[offset + 1];
}
function readUint16LE(data, offset) {
  return data[offset] | data[offset + 1] << 8;
}
function readUint24LE(data, offset) {
  return data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16;
}
function readUint32BE(data, offset) {
  return (data[offset] << 24 | data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3]) >>> 0;
}
function readUint32LE(data, offset) {
  return (data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] << 24) >>> 0;
}
function readInt32LE(data, offset) {
  return readUint32LE(data, offset) | 0;
}
export {
  getTurboFileImageSizeFromHeader
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdHVyYm9maWxlXFxjb21tb25cXHR1cmJvZmlsZUltYWdlU2l6ZS50cyJdLAogICJtYXBwaW5ncyI6ICJBQVVPLFNBQVMsZ0NBQWdDLE1BQW1EO0FBQ2xHLFNBQU8saUJBQWlCLElBQUksS0FDeEIsZ0JBQWdCLElBQUksS0FDcEIsZ0JBQWdCLElBQUksS0FDcEIsMEJBQTBCLElBQUksS0FDOUIsaUJBQWlCLElBQUk7QUFDMUI7QUFFQSxTQUFTLGlCQUFpQixNQUFtRDtBQUM1RSxNQUFJLEtBQUssYUFBYSxLQUFLLEtBQUssQ0FBQyxNQUFNLE9BQVEsS0FBSyxDQUFDLE1BQU0sS0FBTTtBQUNoRSxXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0sc0JBQXNCLG9CQUFJLElBQUk7QUFBQSxJQUNuQztBQUFBLElBQU07QUFBQSxJQUFNO0FBQUEsSUFBTTtBQUFBLElBQ2xCO0FBQUEsSUFBTTtBQUFBLElBQU07QUFBQSxJQUNaO0FBQUEsSUFBTTtBQUFBLElBQU07QUFBQSxJQUNaO0FBQUEsSUFBTTtBQUFBLElBQU07QUFBQSxFQUNiLENBQUM7QUFDRCxNQUFJLFNBQVM7QUFDYixTQUFPLFNBQVMsSUFBSSxLQUFLLFlBQVk7QUFDcEMsUUFBSSxLQUFLLE1BQU0sTUFBTSxLQUFNO0FBQzFCO0FBQ0E7QUFBQSxJQUNEO0FBQ0EsV0FBTyxTQUFTLEtBQUssY0FBYyxLQUFLLE1BQU0sTUFBTSxLQUFNO0FBQ3pEO0FBQUEsSUFDRDtBQUNBLFFBQUksVUFBVSxLQUFLLFlBQVk7QUFDOUI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxTQUFTLEtBQUssUUFBUTtBQUM1QixRQUFJLFdBQVcsT0FBUSxXQUFXLEtBQU07QUFDdkM7QUFBQSxJQUNEO0FBQ0EsUUFBSSxXQUFXLE9BQVEsU0FBUyxJQUFJLEtBQUssWUFBWTtBQUNwRDtBQUFBLElBQ0Q7QUFDQSxVQUFNLGdCQUFnQixh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
