import * as net from 'net';
import * as util from 'util';
import * as lodash from 'lodash';
import * as iconv from 'iconv-lite';
import Util from './util';
const Utils = new Util();
import * as sleep from 'sleep-promise';
import { EventEmitter } from 'events';
import * as debug from 'debug';
const socketDebug = debug('socket');
import { IConfig, IRequestId, IHeader, IResBody, IReqBody } from './interface';
import { defConfig, Command, RequestIdDes, Errors } from './comConfig';

export default class Socket extends EventEmitter {
  private config: IConfig;
  private host: string;
  private port: number;
  private clientID: string;
  private secret: string;
  private ClientVersion: number;
  private isReady: boolean;
  private heartbeatAttempts: number; //心跳次数
  private heartbeatMaxAttempts: number;
  private heartbeatHandle: NodeJS.Timeout;
  private bufferCache: Buffer;
  private headerLength: number;
  private socket: net.Socket;
  private sequenceMap: Map<number, NodeJS.Timeout[]>;
  private contentLimit = 70; //短信内容长度
  constructor(config: IConfig) {
    super();
    this.config = Object.assign(config, defConfig);
    this.host = this.config.host;
    this.port = this.config.port;
    this.clientID = this.config.clientID;
    this.secret = this.config.secret;
    this.ClientVersion = this.config.ClientVersion ?? 0x30;
    this.isReady = false;
    this.heartbeatAttempts = 0;
    this.headerLength = 12;
    this.heartbeatMaxAttempts = this.config.heartbeatMaxAttempts ?? 3;
    this.connect(this.host, this.port);
  }

  /**
   * 发送Active_Test保持心跳
   */
  handleHeartbeat() {
    if (this.isReady) {
      this.heartbeatAttempts++;
      socketDebug(`heart beat attempts ${this.heartbeatAttempts}`);
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
    socketDebug(`start to create connection`);
    this.connectSocket(host, port)
      .then(() => {
        socketDebug(`${host}:${port} connected`);
        this.heartbeatAttempts = 0;
        this.handleHeartbeat();
        this.isReady = true;
        const TimeStamp = Utils.TimeStamp();
        const AuthenticatorClient = Utils.getAuthenticatorClient(this.clientID, this.secret, TimeStamp);
        this.send(Command.Login, {
          ClientID: this.clientID,
          AuthenticatorClient,
          LoginMode: 2,
          TimeStamp: `0x${parseInt(TimeStamp).toString(16).toUpperCase()}`,
          ClientVersion: this.ClientVersion,
        });
      })
      .catch(err => {
        this.destroySocket();
      });
  }

  /**
   * socket链接
   * @param port
   * @param host
   */
  connectSocket(host: string, port: number) {
    if (this.isReady) return Promise.resolve();
    if (this.socket) return Promise.resolve();
    this.socket = new net.Socket();
    this.bufferCache = Buffer.alloc(0);

    this.socket.on('data', buffer => {
      if (!this.bufferCache) {
        this.bufferCache = buffer;
      } else {
        this.bufferCache = Buffer.concat([this.bufferCache, buffer]);
      }
      const data = { header: undefined, buffer: undefined };
      while (this.fetchData(data)) {
        this.handleBuffer(data.buffer, data.header);
      }
    });

    this.socket.on('error', err => {
      this.emit('error', err);
      Promise.reject(err);
      this.destroySocket();
    });

    this.socket.on('connect', () => {
      this.emit('connect');
      Promise.resolve();
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
  async send(command: keyof IRequestId, body?) {
    if (this.sequenceMap.size > 16) return '下发速度太快！';
    const SequenceID = Utils.getSequenceId();
    const buf = Utils.getBuf({ SequenceID, RequestID: command }, body);
    socketDebug(`${command} send buffer: ${util.inspect(buf)}`);
    this.socket.write(buf);

    //超时后60秒进行重发，总共不超过3次
    const timeoutHandle = setTimeout(() => {
      this.popPromise(command, timeoutHandle, body);
    }, this.config.heartbeatTimeout);

    this.pushPromise(command, timeoutHandle, body);
  }

  /**
   * 获取数据状态
   * @param data
   */
  fetchData(data: { header: IHeader; buffer: Buffer }) {
    if (this.bufferCache.length < this.headerLength) return false;

    data.header = Utils.ReadHeader(this.bufferCache);
    if (this.bufferCache.length < data.header.PacketLength) return false;

    data.buffer = this.bufferCache.slice(0, data.header.PacketLength);
    socketDebug('%d receive buffer: ', data.header.RequestID, data.buffer);
    this.bufferCache = this.bufferCache.slice(data.header.PacketLength);
    return true;
  }

  /**
   * 处理网关发过来的消息
   * @param body
   * @param header
   */
  async handleBuffer(buffer: Buffer, header: IHeader) {
    const bodyObj: IReqBody & IResBody = Utils.ReadBody(buffer.slice(this.headerLength), header.RequestID);

    //证明有响应，则取消重试
    this.sequenceMap.get(header.SequenceID).forEach(timeHandle => {
      clearTimeout(timeHandle);
    });

    //删除缓存
    this.sequenceMap.delete(header.SequenceID);

    // 服务端发送Exit请求
    if (header.RequestID === Command.Exit) {
      this.emit('exit');
      clearTimeout(this.heartbeatHandle);
      this.isReady = false;
      this.sendResponse(Command.Exit, header.RequestID);
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
    if (header.RequestID === Command.Active_Test) {
      this.sendResponse(Command.Active_Test_Resp, header.SequenceID);
      return;
    }

    //如果消息为除了上行消息和状态报告的响应
    if (header.RequestID > 0x80000000) {
      const timeHandle = this.sequenceMap.get(header.SequenceID);
      if (!timeHandle) {
        this.emit('error', new Error(RequestIdDes[header.RequestID] + ': resp has no timeHandle'));
        return;
      }

      if (bodyObj?.Status > 0) {
        let result = 'result:' + (Errors[bodyObj.Status] || bodyObj.Status);
        if (header.RequestID === Command.Login_Resp) result = 'status:' + (Errors[bodyObj.Status] || bodyObj.Status);
        const msg = 'command:' + RequestIdDes[header.RequestID] + ' failed. result:' + result;
        this.emit('error', msg);
      } else {
        this.emit('deliver', { header: header, body: bodyObj });
      }
      return;
    }
    this.emit('error', new Error(RequestIdDes[header.RequestID] + ': no handler found'));
    return;
  }

  /**
   * 发送响应数据
   * @param command
   * @param sequence
   * @param body
   */
  sendResponse(command: number, sequence: number, ResBody?: IResBody) {
    const buf = Utils.getBuf({ SequenceID: sequence, RequestID: command }, ResBody);
    socketDebug('%s send buffer:', command, util.inspect(buf));
    this.socket.write(buf);
  }

  /**
   * 连接销毁
   */
  destroySocket() {
    socketDebug('destroy Socket');
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
  pushPromise(command: keyof IRequestId, timeHandle: NodeJS.Timeout, body?: Record<string, number | string>) {
    let mapkey;
    switch (RequestIdDes[command]) {
      case 'Login':
        mapkey = `${command}#${body.ClientID}`;
      case 'Submit':
        mapkey = `${command}#${body.DestTermID}#${body.MsgContent}`;
      case 'Deliver_Resp':
        mapkey = `${command}#${body.MsgID}#${body.Status}`;
      default:
        mapkey = `${command}`;
    }

    if (!this.sequenceMap.has(mapkey)) {
      this.sequenceMap.set(mapkey, [timeHandle]);
    } else if (lodash.isArray(this.sequenceMap.get(mapkey))) {
      this.sequenceMap.set(mapkey, this.sequenceMap.get(mapkey).concat(timeHandle));
    }
  }

  /**
   * 每个请求进行记录，并确保响应超时重发
   * @param sequenceId 流水号
   * @param deferred
   */
  popPromise(command: keyof IRequestId, timeHandle: NodeJS.Timeout, body?: Record<string, number | string>) {
    let mapkey;
    switch (RequestIdDes[command]) {
      case 'Login':
        mapkey = `${command}#${body.ClientID}`;
      case 'Submit':
        mapkey = `${command}#${body.DestTermID}#${body.MsgContent}`;
      case 'Deliver_Resp':
        mapkey = `${command}#${body.MsgID}#${body.Status}`;
      default:
        mapkey = `${command}`;
    }

    if (!this.sequenceMap.has(mapkey) || this.sequenceMap.get(mapkey).length <= 3) {
      this.send(command, body);
    } else {
      process.nextTick(() => {
        this.sequenceMap.delete(mapkey);
      });
      this.emit('timeout', command, mapkey, body);
    }
  }

  sendSms(mobile: string, content: string, extendCode?: string) {
    if (!this.isReady) {
      return this.emit('error', 'tcp socket is not Ready. please retry later');
    }
    const IsLongSms: boolean = content.length > this.contentLimit;
    const body = Utils.getSmsBody(IsLongSms);
    const ServiceID = this.config.serviceId;
    const SrcTermID = extendCode ? this.config.srcId + extendCode : this.config.srcId;
    const DestTermID = Buffer.alloc(21, 0);
    DestTermID.write(mobile, 'ascii');
    if (!IsLongSms) {
      const MsgContentStr = iconv.encode(content, 'gbk');
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
      UdhiBuf.writeInt8(Math.floor(Math.random() * 128), 3);
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
}
