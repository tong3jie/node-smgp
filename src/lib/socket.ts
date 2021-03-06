import * as net from 'net';
import * as iconv from 'iconv-lite';
import Util from './util';
const Utils = new Util();
import * as sleep from 'sleep-promise';
import { EventEmitter } from 'events';
import { SMGP_IConfig, SMGP_IRequestId, SMGP_IHeader, SMGP_IResBody, SMGP_IReqBody } from './interface';
import { defConfig, Command, RequestIdDes, Errors } from './Config';

export default class Socket extends EventEmitter {
  private config: SMGP_IConfig;
  private host: string;
  private port: number;
  private clientID: string;
  private secret: string;
  private ClientVersion: number;
  private isReady: boolean;
  private heartbeatAttempts: number; //心跳次数
  private heartbeatMaxAttempts: number;
  private heartbeatHandle: NodeJS.Timeout;
  private bufferCache = Buffer.alloc(0);
  private HEADER_LENGTH: number;
  private socket: net.Socket;
  private sequenceMap: Map<string, Record<string, any>>;
  private CONTENT_Limit = 70; //短信内容长度

  constructor(config: SMGP_IConfig) {
    super();
    this.config = { ...defConfig, ...config };
    this.host = this.config.host;
    this.port = this.config.port;
    this.clientID = this.config.clientID;
    this.secret = this.config.secret;
    this.ClientVersion = this.config.ClientVersion ?? 0x30;
    this.isReady = false;
    this.heartbeatAttempts = 0;
    this.HEADER_LENGTH = 12;
    this.sequenceMap = new Map();
    this.heartbeatMaxAttempts = this.config.heartbeatMaxAttempts ?? 3;
    this.connect(this.host, this.port);
    this.reSend();
  }

  /**
   * 发送Active_Test保持心跳
   */
  handleHeartbeat() {
    if (this.isReady) {
      this.heartbeatAttempts++;
      if (this.heartbeatAttempts > this.heartbeatMaxAttempts) {
        this.disconnect();
        this.emit('exit', 'heartbeat exit');
      }

      this.send(Command.Active_Test).then(() => {
        this.heartbeatAttempts = 0;
      });
    }
    this.heartbeatHandle = setTimeout(() => {
      this.handleHeartbeat();
    }, this.config.heartbeatInterval);
  }

  /**
   * TCP建链
   * @param port
   * @param host
   */
  connect(host: string, port: number) {
    console.log('start to create connection');
    (async () => {
      await this.connectSocket(host, port);
    })().then(() => {
      if (this.socket) {
        console.log(`${host}:${port} connected`);
      } else {
        console.log(`${host}:${port} failed`);
      }
    });
    this.heartbeatAttempts = 0;
    this.handleHeartbeat();
    this.isReady = true;
    const TimeStamp = Utils.TimeStamp();
    const AuthenticatorClient = Utils.getSmgpAuthenticator(this.clientID, this.secret, TimeStamp);
    // 发送鉴权信息
    this.send(Command.Login, {
      ClientID: this.clientID,
      AuthenticatorClient,
      LoginMode: 2,
      TimeStamp: parseInt(TimeStamp),
      ClientVersion: this.ClientVersion,
    });
  }

  /**
   * socket链接
   * @param port
   * @param host
   */
  async connectSocket(host: string, port: number) {
    if (this.isReady) return Promise.resolve();
    if (this.socket) return Promise.resolve();
    this.socket = new net.Socket();

    this.socket.on('data', buffer => {
      this.bufferCache = Buffer.concat([this.bufferCache, buffer]);
      const data = { header: undefined, buffer: undefined };
      while (this.fetchData(data)) {
        this.handleBuffer(data.buffer, data.header);
      }
    });

    this.socket.on('error', err => {
      this.emit('error', err);
      this.destroySocket();
      setTimeout(() => {
        this.connect(this.host, this.port);
      }, this.config.heartbeatInterval);
    });

    this.socket.on('connect', () => {
      this.emit('connect');
    });
    this.socket.connect(port, host);
    return Promise.resolve();
  }

  /**
   * 断开链接
   */
  disconnect() {
    this.isReady = false;
    clearTimeout(this.heartbeatHandle);
    this.send(Command.Exit).finally(() => {
      this.destroySocket();
    });
  }

  /**
   * 发送消息到网关
   * @param command
   * @param body
   */
  async send(command: keyof SMGP_IRequestId, body?) {
    // if (this.sequenceMap.size > 16) return this.emit('error', '下发速度太快！');
    const SequenceID = Utils.getSequenceId();
    const buf = Utils.enCode({ SequenceID, RequestID: command }, body);
    this.socket.write(buf);
    if (command === Command.Submit) {
      this.pushPromise({ SequenceID, RequestID: command }, body);
    }
  }

  /**
   * 处理网关发过来的消息
   * @param body
   * @param header
   */
  async handleBuffer(buffer: Buffer, header: SMGP_IHeader) {
    const bodyObj: SMGP_IReqBody & SMGP_IResBody = Utils.deCodeBody(buffer.slice(this.HEADER_LENGTH), header.RequestID);

    // 服务端返回login请求
    if (header.RequestID === Command.Login_Resp) {
      if (bodyObj.Status !== 0) {
        const msg = `command: ${RequestIdDes[header.RequestID]} failed! result: ${Errors[bodyObj.Status] || bodyObj.Status}`;
        this.emit('error', msg);
        clearTimeout(this.heartbeatHandle);
        this.isReady = false;
        await sleep(100);
        this.destroySocket();
      }
      console.log('congratulations! server was connected');
      return;
    }

    // 服务端返回submit请求
    if (header.RequestID === Command.Submit_Resp) {
      const submitBody = this.popPromise(header);
      this.emit('submit', { header, body: { ...submitBody, ...bodyObj } });
      return;
    }

    // 服务端发送Exit请求
    if (header.RequestID === Command.Exit) {
      this.emit('exit');
      clearTimeout(this.heartbeatHandle);
      this.isReady = false;
      this.sendResponse(Command.Exit_Resp, header.RequestID);
      await sleep(100);
      this.destroySocket();
      return;
    }

    // 服务端发送上行或者状态报告
    if (header.RequestID === Command.Deliver) {
      this.emit('deliver', { header: header, body: bodyObj }, (status = 0) => {
        this.sendResponse(Command.Deliver_Resp, header.SequenceID, { MsgID: bodyObj.MsgID, Status: status });
      });
      return;
    }

    // 信令检测
    if (header.RequestID === Command.Active_Test_Resp) {
      return;
    }

    //如果消息为除了上行消息和状态报告的响应
    if (header.RequestID > 0x80000000) {
      if (bodyObj?.Status > 0) {
        const msg = `command: ${RequestIdDes[header.RequestID]} failed! result: ${Errors[bodyObj.Status] || bodyObj.Status}`;
        this.emit('error', msg);
        return;
      }
    }
  }

  /**
   * 发送响应数据
   * @param command
   * @param sequence
   * @param body
   */
  sendResponse(command: number, sequence: number, ResBody?: SMGP_IResBody) {
    const buf = Utils.enCode({ SequenceID: sequence, RequestID: command }, ResBody);
    this.socket.write(buf);
  }

  /**
   * 连接销毁
   */
  destroySocket() {
    this.isReady = false;
    if (this.socket) {
      this.socket.end();
      this.socket.destroy();
      this.socket = undefined;
    }
  }

  /**
   * 每个请求进行记录，并确保响应超时重发
   * @param sequenceId 流水号
   * @param deferred
   */
  pushPromise(header: SMGP_IHeader, body?: Record<string, any>) {
    const mapkey = `${header.SequenceID}`;

    if (body?.time) {
      body.time++;
      this.sequenceMap.set(mapkey, { ...body, timeStamp: Date.now() });
    } else {
      this.sequenceMap.set(mapkey, { ...body, timeStamp: Date.now(), time: 1 });
    }
  }

  /**
   * 每个请求进行记录，并确保响应超时重发
   * @param sequenceId 流水号
   * @param deferred
   */
  popPromise(header: SMGP_IHeader) {
    const mapkey = `${header.SequenceID}`;
    const submitBody = this.sequenceMap.get(mapkey);
    if (this.sequenceMap.delete(mapkey)) return submitBody;
    else this.emit('error', 'no this handle');
  }

  /**
   *
   * @param mobile 手机号码
   * @param content 发送内容
   * @param extendCode 扩展码
   * @returns Void
   */
  sendSms(mobile: string, content: string, extendCode?: string): boolean | void {
    if (!this.isReady) {
      return this.emit('error', 'tcp socket is not Ready. please retry later');
    }
    const IsLongSms: boolean = content.length > this.CONTENT_Limit;
    const body = Utils.getDefBody(IsLongSms);
    const ServiceID = this.config.serviceId;
    const SrcTermID = extendCode ? this.config.srcId + extendCode : this.config.srcId;
    const DestTermID = Buffer.alloc(21, 0);
    DestTermID.write(mobile, 'ascii');
    if (!IsLongSms) {
      const MsgContentStr = iconv.encode(content, 'GB18030');
      const MsgContent = Buffer.from(MsgContentStr);
      const MsgLength = MsgContent.length;
      const Submitbody = Object.assign(body, { ServiceID, SrcTermID, DestTermID, MsgContent, MsgLength });
      this.send(Command.Submit, Submitbody);
    } else {
      const MsgContentBuf = Buffer.from(content, 'ucs2').swap16();
      const sliceCount = 70 * 2 - 6;
      const PkTotal = Math.ceil(MsgContentBuf.length / sliceCount);
      const UdhiBuf = Buffer.alloc(6);
      UdhiBuf.writeInt8(5, 0);
      UdhiBuf.writeInt8(0, 1);
      UdhiBuf.writeInt8(3, 2);
      UdhiBuf.writeInt8(Utils.getLongSmsNo(), 3);
      UdhiBuf.writeInt8(PkTotal, 4);
      new Array(PkTotal).fill(0).forEach((item, index) => {
        UdhiBuf.writeInt8(index + 1, 5);
        const MsgContent = Buffer.concat([UdhiBuf, MsgContentBuf.slice(sliceCount * index, sliceCount * (index + 1))]);
        const MsgLength = MsgContent.length;
        const Submitbody = Object.assign(body, { ServiceID, SrcTermID, DestTermID, MsgContent, MsgLength, PkTotal, PkNumber: index + 1 });
        this.send(Command.Submit, Submitbody);
      });
    }
  }

  /**
   * 获取数据状态，如果数据超过包头长度，则读取包头中包含的包体的长度
   * @param data
   * @returns Bollen
   */
  fetchData(data: { header: SMGP_IHeader; buffer: Buffer }) {
    if (this.bufferCache.length < Utils.HEADER_LENGTH) return false;

    data.header = Utils.deCodeHeader(this.bufferCache);
    if (this.bufferCache.length < data.header.PacketLength) return false;

    data.buffer = this.bufferCache.slice(0, data.header.PacketLength);
    this.bufferCache = this.bufferCache.slice(data.header.PacketLength);
    return true;
  }

  /**
   * 失败消息重发三次
   * @returns void
   */
  async reSend() {
    for (const [key, body] of this.sequenceMap.entries()) {
      if (!body) return;
      const isTimeOut = Date.now() - body?.timeStamp > 60000 ? true : false;
      if (isTimeOut && body?.time <= 3) {
        this.sequenceMap.delete(key);
        this.send(Command.Submit, body);
      }
      if (body?.time > 3) {
        this.sequenceMap.delete(key);
        this.emit('timeout', body?.DestTermID, body.MsgContent);
      }
    }
    await sleep(60000);
    this.reSend();
  }
}
