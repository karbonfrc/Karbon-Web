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
    const new_lo = (this.low + v) >>> 0;
    let new_hi = this.hi >>> 0;

    if (new_lo < this.low) new_hi++;

    this.hi = new_hi;
    this.low = new_lo;

    if (this.backing !== null) {
      if (this.backing.byteLength < v)
        throw new Error("int64.add32inplace: overflow");
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
    let lo_str = (this.low >>> 0).toString(radix);
    const hi_str = (this.hi >>> 0).toString(radix);

    if (this.hi === 0) return lo_str;

    const width = radix === 16 ? 8 : Math.ceil(32 / Math.log2(radix));
    lo_str = zeroFill(lo_str, width);
    return hi_str + lo_str;
  }
}

globalThis.int64 = int64;

export { int64 };
export default int64;