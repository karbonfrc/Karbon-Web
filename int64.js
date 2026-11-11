function zeroFill(number, width) {
  const str = number.toString();
  const pad = width - str.length;
  return pad > 0 ? "0".repeat(pad) + str : str;
}

class int64 {
  constructor(low, hi) {
    this.low = low >>> 0;
    this.hi = hi >>> 0;
    this.backing = null;
  }

  add32inplace(val) {
    const v = val >>> 0;
    if (this.backing !== null && this.backing.byteLength < v)
      throw new Error("int64.add32inplace: overflow");

    const new_lo = (this.low + v) >>> 0;
    let new_hi = this.hi >>> 0;

    if (new_lo < this.low) new_hi++;

    this.hi = new_hi;
    this.low = new_lo;

    if (this.backing !== null) {
      this.backing = new Uint8Array(
        this.backing.buffer,
        this.backing.byteOffset + v,
        this.backing.byteLength - v,
      );
    }
  }

  add32(val) {
    const v = val >>> 0;
    const new_lo = (this.low + v) >>> 0;
    let new_hi = this.hi >>> 0;

    if (new_lo < this.low) new_hi++;

    const ret = new int64(new_lo, new_hi);
    if (this.backing !== null) {
      if (this.backing.byteLength < v)
        throw new Error("int64.add32: overflow");
      ret.backing = new Uint8Array(
        this.backing.buffer,
        this.backing.byteOffset + v,
        this.backing.byteLength - v,
      );
    }
    return ret;
  }

  sub32(val) {
    const v = val >>> 0;
    const new_lo = (this.low - v) >>> 0;
    let new_hi = this.hi >>> 0;
    if (new_lo > this.low) new_hi--;
    return new int64(new_lo, new_hi);
  }

  sub32inplace(val) {
    const v = val >>> 0;
    const new_lo = (this.low - v) >>> 0;
    let new_hi = this.hi >>> 0;
    if (new_lo > this.low) new_hi--;
    this.hi = new_hi;
    this.low = new_lo;
  }

  and32(val) {
    return new int64(this.low & (val >>> 0), this.hi);
  }

  and64(vallo, valhi) {
    return new int64(this.low & (vallo >>> 0), this.hi & (valhi >>> 0));
  }

  toString(radix = 16) {
    if (!Number.isInteger(radix) || radix < 2 || radix > 36)
      throw new RangeError("int64.toString: radix must be between 2 and 36");

    if (this.hi === 0) return (this.low >>> 0).toString(radix);

    // Concatenating 32-bit words is valid only when the radix divides 32
    // into whole digits. Keep that compact path for the common bases.
    if (radix === 2 || radix === 4 || radix === 8 || radix === 16 || radix === 32) {
      const low = (this.low >>> 0).toString(radix);
      const high = (this.hi >>> 0).toString(radix);
      const width = Math.ceil(32 / Math.log2(radix));
      return high + zeroFill(low, width);
    }

    // Divide four 16-bit limbs so intermediate values remain exact in JS.
    const words = [this.hi >>> 16, this.hi & 0xffff, this.low >>> 16, this.low & 0xffff];
    let result = "";
    while (words[0] || words[1] || words[2] || words[3]) {
      let remainder = 0;
      for (let i = 0; i < words.length; i++) {
        const value = remainder * 0x10000 + words[i];
        words[i] = Math.floor(value / radix);
        remainder = value % radix;
      }
      result = remainder.toString(radix) + result;
    }
    return result || "0";
  }
}

globalThis.int64 = int64;

export { int64 };
export default int64;
