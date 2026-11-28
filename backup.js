const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { createHash } = require("crypto");
const { pipeline } = require("stream/promises");

const magic = "qingfeng-image-host/1";
const manifestLimit = 32 * 1024 * 1024;

function invalid(message = "备份格式错误或文件不完整") {
  return Object.assign(new Error(message), { status: 400 });
}

async function* encodeBackup(manifest, fileToDisk) {
  const header = Buffer.from(JSON.stringify({ ...manifest, format: magic }));
  if (header.length > manifestLimit) throw new Error("备份清单超过大小限制");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  yield length;
  yield header;
  yield createHash("sha256").update(header).digest();
  for (const image of manifest.images) {
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of fs.createReadStream(fileToDisk(image.path))) {
      bytes += chunk.length;
      hash.update(chunk);
      yield chunk;
    }
    if (bytes !== image.size) throw new Error("图片大小在备份过程中发生变化");
    yield hash.digest();
  }
}

async function readBackup(filename, validate, destination) {
  const file = await fsp.open(filename, "r");
  try {
    const size = (await file.stat()).size;
    let offset = 0;
    async function read(length) {
      if (length > size - offset) throw invalid();
      const data = Buffer.alloc(length);
      let copied = 0;
      while (copied < length) {
        const { bytesRead } = await file.read(data, copied, length - copied, offset + copied);
        if (!bytesRead) throw invalid();
        copied += bytesRead;
      }
      offset += length;
      return data;
    }
    const length = (await read(4)).readUInt32BE();
    if (length > manifestLimit) throw invalid();
    const header = await read(length);
    if (!createHash("sha256").update(header).digest().equals(await read(32))) throw invalid();
    let manifest;
    try {
      manifest = JSON.parse(header.toString("utf8"));
    } catch {
      throw invalid();
    }
    if (manifest?.format !== magic) throw invalid("备份版本不受支持");
    validate(manifest);
    for (const image of manifest.images) {
      if (image.size > size - offset - 32) throw invalid();
      const hash = createHash("sha256");
      async function* chunks() {
        let remaining = image.size;
        while (remaining) {
          const chunk = await read(Math.min(remaining, 256 * 1024));
          remaining -= chunk.length;
          hash.update(chunk);
          yield chunk;
        }
      }
      if (destination) {
        const target = destination(image.path);
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await pipeline(chunks(), fs.createWriteStream(target, { flags: "wx" }));
      } else {
        for await (const chunk of chunks()) {
          // Consume the bytes so the checksum is verified during preview.
        }
      }
      if (!hash.digest().equals(await read(32))) throw invalid("图片校验失败");
    }
    if (offset !== size) throw invalid();
    return manifest;
  } finally {
    await file.close();
  }
}

module.exports = { encodeBackup, readBackup, invalid };
