// Ključi kartice po NXP AN10922 (enako kot terminal/sc_kartica.py → izpeljan_kljuc):
//   ključ kartice = AES-CMAC(osnovni ključ, 0x01 || UID || AID 5C0001 || SysID 5C4C41)
// in žeton, ki ga terminal (python-desfire) zanesljivo prebere.

export const AID = [0x5c, 0x00, 0x01];
export const SYS_ID = [0x5c, 0x4c, 0x41];

export function izHex(h: string): Uint8Array<ArrayBuffer> {
  const s = h.replace(/\s+/g, "");
  if (!/^([0-9a-fA-F]{2})+$/.test(s)) throw new Error("ni hex");
  return new Uint8Array(s.match(/../g)!.map((x) => parseInt(x, 16)));
}
export function vHex(b: Uint8Array): string {
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

// En blok AES (ECB) prek AES-CBC z ničelnim IV: prvi blok šifropisa
async function aesBlok(kljuc: CryptoKey, blok: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const c = await crypto.subtle.encrypt({ name: "AES-CBC", iv: new Uint8Array(16) }, kljuc, blok);
  return new Uint8Array(c).slice(0, 16);
}

function zamik(b: Uint8Array): Uint8Array<ArrayBuffer> {
  const r = new Uint8Array(16);
  for (let i = 0; i < 16; i++) r[i] = ((b[i] << 1) | (i < 15 ? b[i + 1] >>> 7 : 0)) & 0xff;
  if (b[0] & 0x80) r[15] ^= 0x87;
  return r;
}

export async function cmac(kljucSurov: Uint8Array<ArrayBuffer>, sporocilo: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const kljuc = await crypto.subtle.importKey("raw", kljucSurov, { name: "AES-CBC" }, false, ["encrypt"]);
  const k1 = zamik(await aesBlok(kljuc, new Uint8Array(16)));
  const k2 = zamik(k1);
  const n = Math.max(1, Math.ceil(sporocilo.length / 16));
  const poln = sporocilo.length > 0 && sporocilo.length % 16 === 0;
  const m = new Uint8Array(n * 16);
  m.set(sporocilo);
  if (!poln) m[sporocilo.length] = 0x80;
  const k = poln ? k1 : k2;
  for (let i = 0; i < 16; i++) m[(n - 1) * 16 + i] ^= k[i];
  let x: Uint8Array<ArrayBuffer> = new Uint8Array(16);
  for (let b = 0; b < n; b++) {
    const blok = new Uint8Array(16);
    for (let i = 0; i < 16; i++) blok[i] = x[i] ^ m[b * 16 + i];
    x = await aesBlok(kljuc, blok);
  }
  return x;
}

export async function izpeljiKljuc(osnovniHex: string, uid: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const osnovni = izHex(osnovniHex);
  if (osnovni.length !== 16) throw new Error("osnovni ključ mora imeti 16 bajtov");
  return await cmac(osnovni, new Uint8Array([0x01, ...uid, ...AID, ...SYS_ID]));
}

// JAMCRC (DESFire): ~CRC32, little endian
const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function jamcrc(d: Uint8Array): Uint8Array {
  let c = 0xffffffff;
  for (const b of d) c = TABELA[(c ^ b) & 0xff] ^ (c >>> 8);
  // zlib.crc32 = ~c; JAMCRC = ~zlib.crc32 = c
  const v = c >>> 0;
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
}

// Terminal pred preverbo CRC odreže ničle na koncu odgovora: žeton, pri katerem je zadnji bajt
// CRC32(žeton || 00) enak 0, bi bil neberljiv (1 od 256). Takih ne izdamo.
export function zetonBerljiv(z: Uint8Array): boolean {
  return jamcrc(new Uint8Array([...z, 0]))[3] !== 0;
}
export function novZeton(): Uint8Array {
  for (;;) {
    const z = crypto.getRandomValues(new Uint8Array(16));
    if (zetonBerljiv(z)) return z;
  }
}
