import * as dayjs from 'dayjs';
import * as crypto from 'crypto';
import * as lodash from 'lodash';
import * as iconv from 'iconv-lite';
import { IHeader, IField, IConmmand, IReqBody, IResBody } from './interface';
import { Command, RequestIdDes, commandDes } from './comConfig';

export default class Util {
  private sequenceId: number;
  private longSmsNo: number;
  public headerLength: number;

  constructor() {
    this.sequenceId = 0x00000000;
    this.longSmsNo = 0;
    this.headerLength = 12;
  }

  getSequenceId(): number {
    this.sequenceId >= 0xffffffff ? 1 : this.sequenceId++;
    return this.sequenceId;
  }

  TimeStamp = () => {
    return dayjs().format('MMDDHHmmss');
  };

  MD5(str: string | Buffer): string {
    return crypto.createHash('md5').update(str).digest('hex').toString();
  }

  getAuthenticatorClient(ClientID: string, secret: string, timestamp: string): string {
    const buffers = [];
    buffers.push(Buffer.from(ClientID));
    buffers.push(Buffer.alloc(7, 0));
    buffers.push(Buffer.from(secret));
    buffers.push(Buffer.from(timestamp));
    const buffer = Buffer.concat(buffers);

    return this.MD5(buffer);
  }

  /**
   * 获取发送的内容
   * @param header
   * @param body
   */
  getBuf(header: IHeader, body?: IReqBody | IResBody) {
    header.PacketLength = 12;
    let headBuf: Buffer;
    let bodyBuf: Buffer;
    if (body) {
      bodyBuf = this.getBodyBuffer(header.RequestID, body);
      header.PacketLength += bodyBuf.length;
    }
    headBuf = this.getHeaderBuffer(header);
    return bodyBuf ? Buffer.concat([headBuf, bodyBuf]) : headBuf;
  }

  /**
   * 格式化响应消息头
   * @param buffer
   */
  ReadHeader(buffer: Buffer): IHeader {
    const PacketLength = buffer.readUInt32BE(0);
    const RequestID = buffer.readUInt32BE(4);
    const SequenceID = buffer.readUInt32BE(8);
    return { PacketLength, RequestID, SequenceID };
  }

  /**
   * 获取响应消息头
   * @param header
   */
  getHeaderBuffer(header: IHeader): Buffer {
    const headerLength = 12;
    const buffer = Buffer.alloc(headerLength);
    buffer.writeUInt32BE(header.PacketLength, 0);
    buffer.writeUInt32BE(header.RequestID, 4);
    buffer.writeUInt32BE(header.SequenceID, 8);
    return buffer;
  }

  getBodyBuffer(command: Command, body: Record<string, any>) {
    const buffer = Buffer.alloc(1024 * 1024, 0);
    //根据指令获取指令含义
    const commandStr = RequestIdDes[command];
    //根据指令含义获取Body的字段
    const commandDesp = commandDes[commandStr];
    //如果未获取到指令对应的Body,证明只需要发送消息头即可，则Body为0
    if (!commandDesp) return buffer.slice(0, 0);

    body.length = 0;
    commandDesp.forEach((field: IField) => {
      this.writeBuf(buffer, field, body);
    });
    return buffer.slice(0, body.length);
  }

  /**
   * 组装消息
   * @param buffer
   * @param field  消息头的字段集合
   * @param body {length:string}
   */
  writeBuf(buffer: Buffer, field: IField, body: Record<string, any>) {
    const length = body.length || 0;
    const fieldLength = this.getLength(field, body);
    let value = body[field.name];
    body.length = length + fieldLength;
    if (value instanceof Buffer) {
      value.copy(buffer, length, 0, fieldLength);
    } else {
      if (field.type === 'number' && lodash.isNumber(value)) {
        const bitLength = fieldLength * 8;
        // let method = 'writeUInt' + bitLength + 'BE';
        // if (bitLength === 8) method = 'writeUInt' + bitLength;
        const method = `writeUInt${bitLength}${bitLength === 8 ? '' : 'BE'}`;
        buffer[method](value, length);
      } else if (field.type === 'string') {
        if (!value) value = '';
        buffer.write(value, length, fieldLength, 'ascii');
      }
    }
  }

  /**
   * 当字段为消息内容的时候，先获取下发内容和上行内容的长度
   * @param field
   * @param obj Record<string, any>
   */
  getLength(field: IField, obj: Record<string, any>) {
    if (lodash.isFunction(field.length)) {
      return field.length(obj);
    }
    return field.length;
  }

  /**
   * 读取网关返回的消息体格式
   * @param command
   * @param buffer
   */
  ReadBody(buffer: Buffer, command: Command | keyof IConmmand) {
    const body: any = {};
    let commandStr: string;
    if (lodash.isNumber(command)) {
      commandStr = RequestIdDes[command];
    } else {
      commandStr = command;
    }
    const commandDesp: IField[] = commandDes[commandStr];
    if (!commandDesp) return body;

    commandDesp.forEach((field: IField) => {
      body[field.name] = this.getValue(buffer, field, body);
    });

    if (command === Command.Deliver) {
      if (body.IsReport === 1) {
        body.MsgContent = this.ReadBody(body.MsgContent, 'Deliver_Report_Cotent');
      } else {
        switch (body.MsgFormat) {
          case 15: // gb 汉字
            body.MsgContent = iconv.decode(body.MsgContent, 'gbk');
            break;
          case 8: // ucs2
            body.MsgContent = Buffer.from(body.MsgContent).swap16().toString('ucs2');
            break;
          case 4: // 二进制信息
          case 3: // 短信写卡操作(未知类型)
            body.MsgContent = Buffer.from(body.MsgContent).toString('utf8');
            break;
          case 0: // ASCII串
            body.MsgContent = Buffer.from(body.MsgContent).toString('ascii');
            break;
        }
      }
    }
    return body;
  }

  /**
   * 获取消息体各个字段的值
   * @param buffer
   * @param field
   * @param obj
   */
  getValue(buffer: Buffer, field: IField, body) {
    const length = body.length || 0;
    if (length >= buffer.length) return;
    let fieldLength;
    lodash.isFunction(field.length) ? (fieldLength = field.length(body)) : (fieldLength = field.length);
    body.length = length + fieldLength;
    if (field.type === 'number') {
      const bitLength = fieldLength * 8;
      let method = `readUInt${bitLength}${bitLength === 8 ? '' : 'BE'}`;
      return buffer[method](length);
    } else if (field.type === 'string') {
      if (field.name === 'MsgContent') {
        const MsgContentBuffer = buffer.slice(length, length + fieldLength);
        if (MsgContentBuffer[0] === 5 && MsgContentBuffer[1] === 0 && MsgContentBuffer[2] === 3) {
          body.smsNo = MsgContentBuffer[3];
          return MsgContentBuffer.swap16().toString('ucs2', 6, MsgContentBuffer.length);
        }
        return iconv.decode(MsgContentBuffer, 'GB18030');
      }
      const value = buffer.toString('ascii', length, length + fieldLength);
      return value.replace(/\0+$/, '');
    } else if (field.type === 'buffer') {
      return buffer.slice(length, length + fieldLength);
    }
  }

  getSmsBody(lang: boolean) {
    if (lang === false) {
      return {
        MsgType: 6,
        NeedReport: 1,
        Priority: 3,
        ServiceID: '',
        FeeType: '00',
        FeeCode: '000000',
        FixedFee: '000000',
        MsgFormat: 15,
        ValidTime: '',
        AtTime: '',
        SrcTermID: '',
        ChargeTermID: '',
        DestTermIDCount: 1,
        DestTermID: '',
        MsgLength: 0,
        MsgContent: '',
        Reserve: '',
      };
    } else {
      return {
        MsgType: 6,
        NeedReport: 1,
        Priority: 3,
        ServiceID: '',
        FeeType: '00',
        FeeCode: '000000',
        FixedFee: '000000',
        MsgFormat: 8,
        ValidTime: '',
        AtTime: '',
        SrcTermID: '',
        ChargeTermID: '',
        DestTermIDCount: 1,
        DestTermID: '',
        MsgLength: 0,
        MsgContent: '',
        Reserve: '',
        TP_pid: 0,
        TP_udhi: 1, //长短信时为1
        PkTotal: 2, //长短信总条数
        PkNumber: 1, //长短信序号
      };
    }
  }

  getlongSmsNo() {
    return this.longSmsNo >= 127 ? 1 : this.longSmsNo++;
  }
}
