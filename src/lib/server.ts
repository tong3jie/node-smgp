import * as net from 'net';
import Util from './util';
const Utils = new Util();
import { IHeader, IResBody, IReqBody, IServerConf } from './interface';
import { Command } from './comConfig';
import { EventEmitter } from 'events';
import { result } from 'lodash';

export default class SmgpServer extends EventEmitter {
  public bufferCache: Buffer;
  public config: IServerConf;
  public server: net.Server;
  public socket: net.Socket;
  public Login: Function;
  public Submit: Function;
  public Deliver: Function;

  constructor(config: IServerConf) {
    super();
    this.config = config;
    this.Login = config.Login;
    this.Submit = config.Submit;
    this.Deliver = config.Deliver;
  }

  start() {
    const server = net.createServer(socket => {
      this.socket = socket;
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

      this.socket.on('close', had_error => {
        if (!had_error) {
          console.log('client closed success! %j:%j', this.socket.remoteAddress, this.socket.remotePort);
        } else {
          console.log('client close ');
        }
      });

      this.socket.on('error', err => {
        this.emit('error');
      });
    });
    server.listen({ port: this.config.port, host: this.config.host });
  }

  /**
   * 处理网关发过来的消息
   * @param body
   * @param header
   */
  handleBuffer(buffer: Buffer, header: IHeader) {
    const bodyObj: IReqBody & IResBody = Utils.ReadBody(buffer.slice(Utils.headerLength), header.RequestID);

    // //证明有响应，则取消重试
    // sequenceMap.get(header.SequenceID).forEach(timeHandle => {
    //   clearTimeout(timeHandle);
    // });

    // //删除缓存
    // this.sequenceMap.delete(header.SequenceID);

    // 服务端发送注册请求
    if (header.RequestID === Command.Login) {
      const reult: boolean = this.Login(bodyObj);
      const buf = Utils.getBuf({ SequenceID: header.SequenceID, RequestID: Command.Login_Resp }, { Status: reult ? 0 : 21, AuthenticatorServer: '123', ServerVersion: 0x30 });
      this.socket.write(buf);
      if (!result) this.socket.destroy();
      return;
    }

    // 客户端发送Exit请求
    if (header.RequestID === Command.Exit) {
      const buf = Utils.getBuf({ SequenceID: header.SequenceID, RequestID: Command.Exit_Resp });
      this.socket.write(buf);
      this.socket.destroy();
      return;
    }

    // 服务端发送上行或者状态报告
    if (header.RequestID === Command.Submit) {
      const buf = Utils.getBuf({ SequenceID: header.SequenceID, RequestID: Command.Submit_Resp }, { MsgID: Date.now().toString(), Status: 0 });
      this.socket.write(buf);
      this.Submit({ header: header, body: bodyObj });
      return;
    }

    // 信令检测
    if (header.RequestID === Command.Active_Test) {
      const buf = Utils.getBuf({ SequenceID: header.SequenceID, RequestID: Command.Active_Test_Resp });
      this.socket.write(buf);
      return;
    }

    //如果消息为除了上行消息和状态报告的响应
    if (header.RequestID === 0x80000003) {
      this.Deliver({ header: header, body: bodyObj });
      return;
    }
    this.emit('error', new Error('no handler found'));
    return;
  }

  /**
   * 获取数据状态
   * @param data
   */
  fetchData(data: { header: IHeader; buffer: Buffer }) {
    if (this.bufferCache.length < Utils.headerLength) return false;

    data.header = Utils.ReadHeader(this.bufferCache);
    if (this.bufferCache.length < data.header.PacketLength) return false;

    data.buffer = this.bufferCache.slice(0, data.header.PacketLength);
    // socketDebug('%d receive buffer: ', data.header.RequestID, data.buffer);
    this.bufferCache = this.bufferCache.slice(data.header.PacketLength);
    return true;
  }
}
