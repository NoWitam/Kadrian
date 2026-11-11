/**
 * Where a decode of H.264 may start (D79.5, D82.5): a sample whose bytes hold
 * an IDR picture. Both hosts start a decode only there — the Player for every
 * frame it decodes, the Producer when it goes back — so that a frame decoded
 * after a seek has the pixels of the same frame decoded from the start. A
 * container's key flag is not enough: a recovery point that is not an IDR
 * picture may refer to pictures before it. Pure: no DOM, no clock; the hosts
 * call it, the render page does not.
 */

/**
 * Whether a sample holds an IDR slice (D79.5): the NAL units of its
 * length-prefixed data, the length size taken from the `avcC` record
 * (`lengthSizeMinusOne`, its fifth byte). A NAL unit of length 0 or one that
 * runs past the sample ends the reading with `false`.
 */
export function holdsIdr(avcC: Uint8Array, sample: Uint8Array): boolean {
  const lengthSize = ((avcC[4] ?? 3) & 3) + 1;
  let at = 0;
  while (at + lengthSize <= sample.length) {
    let length = 0;
    for (let byte = 0; byte < lengthSize; byte += 1) {
      length = length * 256 + (sample[at + byte] as number);
    }
    at += lengthSize;
    if (length === 0 || at + length > sample.length) return false;
    if (((sample[at] as number) & 0x1f) === 5) return true;
    at += length;
  }
  return false;
}
