// chrome.storage.session only holds JSON, but the editor host needs the file's RAW BYTES
// (so the "Encoding" read option can decode them again with another encoding). Base64 is
// the cheapest JSON-safe carrier: 4/3 of the size, against 4x for an array of numbers.

// btoa() takes a string, and String.fromCharCode(...huge) blows the argument limit,
// so feed it in chunks.
const CHUNK = 0x8000;

export function bytesToBase64(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
