import * as dayjs from 'dayjs';
import * as crypto from 'crypto';
import * as lodash from 'lodash';
import * as iconv from 'iconv-lite';
import { SMGP_IHeader, SMGP_IField, SMGP_IReqBody, SMGP_IResBody } from './interface';
import { Command, RequestIdDes, commandDes } from './Config';

export default class Util {
  private sequenceId: number;
  private longSmsNo: number;
  public HEADER_LENGTH: number;

  constructor() {
    // 流水号
    this.sequenceId = 0x00000000;
    // 长短信的标识
    this.longSmsNo = 0;
    // 短信内容头
    this.HEADER_LENGTH = 12;
  }

  /**
   * 获取序列号
   * @returns number
   */
  getSequenceId(): number {
    this.sequenceId >= 0xffffffff ? (this.sequenceId = 1) : this.sequenceId++;
    return this.sequenceId;
  }

  /**
   * 获取时间戳
   * @returns string
   */
  TimeStamp = () => {
    return dayjs().format('MMDDHHmmss');
  };

  /**
   * MD5加密
   * @param str string
   * @returns string
   */
  MD5(str: string | Buffer): string {
    return crypto.createHash('md5').update(str).digest('hex').toString();
  }

  /**
   * smgp鉴权加密
   * @param ClientID
   * @param secret
   * @param timestamp
   * @returns
   */
  getSmgpAuthenticator(ClientID: string, secret: string, timeStamp: string): string {
    const buffers = [];
    buffers.push(Buffer.from(ClientID));
    buffers.push(Buffer.alloc(7, 0));
    buffers.push(Buffer.from(secret));
    buffers.push(Buffer.from(timeStamp));
    const buffer = Buffer.concat(buffers);
    return this.MD5(buffer);
  }

  /**
   * 编码
   * @param header
   * @param body
   */
  enCode(header: SMGP_IHeader, body?: SMGP_IReqBody | SMGP_IResBody) {
    header.PacketLength = this.HEADER_LENGTH;
    let bodyBuf: Buffer;
    if (body) {
      bodyBuf = this.enCodeBody(header.RequestID, body);
      header.PacketLength += bodyBuf.length;
    }
    const headBuf: Buffer = this.enCodeHeader(header);
    return bodyBuf ? Buffer.concat([headBuf, bodyBuf]) : headBuf;
  }

  /**
   * 编码消息头
   * @param header
   */
  enCodeHeader(header: SMGP_IHeader): Buffer {
    const headerLength = this.HEADER_LENGTH;
    const buffer = Buffer.alloc(headerLength);
    buffer.writeUInt32BE(header.PacketLength, 0);
    buffer.writeUInt32BE(header.RequestID, 4);
    buffer.writeUInt32BE(header.SequenceID, 8);
    return buffer;
  }

  /**
   * 编码消息体
   * @param command  消息类型
   * @param body  消息体:JSON
   * @returns Buffer
   */
  enCodeBody(command: Command, body: Record<string, any>) {
    const buffer = Buffer.alloc(1024 * 1024, 0);
    //根据指令获取指令含义
    const commandStr = RequestIdDes[command];
    //根据指令含义获取Body的字段
    const commandDesp = commandDes[commandStr];
    //如果未获取到指令对应的Body,证明只需要发送消息头即可，则Body为0
    if (!commandDesp) return buffer.slice(0, 0);

    body.length = 0;
    commandDesp.forEach((field: SMGP_IField) => {
      this.enCodeValue(buffer, field, body);
    });
    return buffer.slice(0, body.length);
  }

  /**
   * 编码消息体各个字段
   * @param buffer
   * @param field  消息头的字段集合
   * @param body {length:string}
   */
  enCodeValue(buffer: Buffer, field: SMGP_IField, body: Record<string, any>) {
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
   * 解码消息头
   * @param buffer
   */
  deCodeHeader(buffer: Buffer): SMGP_IHeader {
    const PacketLength = buffer.readUInt32BE(0);
    const RequestID = buffer.readUInt32BE(4);
    const SequenceID = buffer.readUInt32BE(8);
    return { PacketLength, RequestID, SequenceID };
  }

  /**
   * 解码消息体
   * @param command
   * @param buffer
   */
  deCodeBody(buffer: Buffer, command: Command) {
    const body: any = {};
    const commandStr: string = RequestIdDes[command];

    const commandDesp: SMGP_IField[] = commandDes[commandStr];
    if (!commandDesp) return body;

    commandDesp.forEach((field: SMGP_IField) => {
      body[field.name] = this.deCodeValue(buffer, field, body);
    });

    if (command === Command.Deliver) {
      if (body.IsReport === 1) {
        body.MsgContent = this.deCodeBody(body.MsgContent, Command.Deliver_Report_Content);
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
   * 解码消息体各个字段的值
   * @param buffer
   * @param field
   * @param obj
   */
  deCodeValue(buffer: Buffer, field: SMGP_IField, body) {
    const length = body.length || 0;
    if (length >= buffer.length) return;
    let fieldLength;
    typeof field.length === 'number' ? (fieldLength = field.length) : (fieldLength = field.length(body));
    body.length = length + fieldLength;
    if (field.type === 'number') {
      const bitLength = fieldLength * 8;
      const method = `readUInt${bitLength}${bitLength === 8 ? '' : 'BE'}`;
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

  /**
   * 当字段为消息内容的时候，先获取下发内容和上行内容的长度
   * @param field
   * @param obj Record<string, any>
   */
  getLength(field: SMGP_IField, obj: Record<string, any>) {
    if (typeof field.length === 'number') {
      return field.length;
    } else {
      return field.length(obj);
    }
  }

  /**
   * 获取默认的消息字段内容
   * @param lang boolean
   */
  getDefBody(lang: boolean) {
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

  /**
   * 长短信包头标识
   * @returns
   */
  getLongSmsNo() {
    return this.longSmsNo >= 127 ? 1 : this.longSmsNo++;
  }
}
