const buf = Buffer.allocUnsafe(10);
// const aa = 0x02706104231600987654;
buf.writeUIntBE(parseInt('0x027061'), 0, 3);
buf.writeUIntBE(0x04231600, 3, 4);
buf.writeUIntBE(0x987654, 7, 3);

console.log(buf.length);

console.log(buf.toString());

const HEX2BCD = (hex_data: number) => {
  let bcd_data: number;
  let temp: number;
  temp = hex_data % 100;
  bcd_data = (hex_data / 100) << 8;
  bcd_data = bcd_data | ((temp / 10) << 4);
  bcd_data = bcd_data | temp % 10;
  return bcd_data;
};

const aa = HEX2BCD(0x02706104231600987654);

console.log(aa);
