import * as net from 'net';
import Util from './util';
import * as iconv from 'iconv-lite';
const Utils = new Util();
import { SMGP_IHeader, SMGP_IServerConf, SMGP_ISubmit_Resp, SMGP_ILogin_Resp, SMGP_ILogin, SMGP_ISubmit, SMGP_IDeliver_Resp, SMGP_IDeliver_Report_Content } from './interface';
import { Command } from './Config';
import { EventEmitter } from 'events';

export default class SmgpServer extends EventEmitter {
  public bufferCache: Buffer;
  public config: SMGP_IServerConf;
  public server: net.Server;
  public socket: net.Socket;
  public LoginRes: ({ header: SMGP_IHeader, body: SMGP_ILogin }) => SMGP_ILogin_Resp;
  public SubmitRes: ({ header: SMGP_IHeader, body: SMGP_ISubmit }) => SMGP_ISubmit_Resp;
  public DeliverRes: ({ header: SMGP_IHeader, body: SMGP_IDeliver_Resp }) => void;

  constructor(config: SMGP_IServerConf) {
    super();
    this.config = config;
    this.LoginRes = config.LoginRes;
    this.SubmitRes = config.SubmitRes;
    this.DeliverRes = config.DeliverRes;
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

      this.socket.on('close', error => {
        if (!error) {
          console.log(`client closed success! ${this.socket.remoteAddress}:${this.socket.remotePort}`);
        } else {
          console.log('client close ');
        }
      });

      this.socket.on('error', err => {
        this.emit('error', err);
      });
    });
    server.listen({ port: this.config.port, host: this.config.host }, () => {
      console.log('smgp server was started!');
    });
    this.server = server;
  }

  /**
   * 处理网关发过来的消息
   * @param body
   * @param header
   */
  handleBuffer(buffer: Buffer, header: SMGP_IHeader) {
    // //证明有响应，则取消重试
    // sequenceMap.get(header.SequenceID).forEach(timeHandle => {
    //   clearTimeout(timeHandle);
    // });

    // //删除缓存
    // this.sequenceMap.delete(header.SequenceID);

    // 服务端发送注册请求
    if (header.RequestID === Command.Login) {
      const bodyObj: SMGP_ILogin = Utils.deCodeBody(buffer.slice(Utils.HEADER_LENGTH), header.RequestID);
      const result = this.LoginRes({ header: header, body: bodyObj });
      const buf = Utils.enCode(
        { SequenceID: header.SequenceID, RequestID: Command.Login_Resp },
        {
          Status: result ? 0 : 21,
          AuthenticatorServer: '123',
          ServerVersion: 0x30,
        },
      );
      this.socket.write(buf);
      if (!result) this.socket.destroy();
      return;
    }

    // 客户端发送Exit请求
    if (header.RequestID === Command.Exit) {
      const buf = Utils.enCode({
        SequenceID: header.SequenceID,
        RequestID: Command.Exit_Resp,
      });
      this.socket.write(buf);
      this.socket.destroy();
      return;
    }

    // 服务端发送上行或者状态报告
    if (header.RequestID === Command.Submit) {
      const bodyObj: SMGP_ISubmit = Utils.deCodeBody(buffer.slice(Utils.HEADER_LENGTH), header.RequestID);
      const submitRes = this.SubmitRes({ header: header, body: bodyObj });
      const buf = Utils.enCode({ SequenceID: header.SequenceID, RequestID: Command.Submit_Resp }, submitRes);

      this.socket.write(buf);

      return;
    }

    // 信令检测
    if (header.RequestID === Command.Active_Test) {
      const buf = Utils.enCode({
        SequenceID: header.SequenceID,
        RequestID: Command.Active_Test_Resp,
      });
      this.socket.write(buf);
      return;
    }

    //如果消息为除了上行消息和状态报告的响应
    if (header.RequestID === Command.Deliver_Resp) {
      const bodyObj: SMGP_IDeliver_Resp = Utils.deCodeBody(buffer.slice(Utils.HEADER_LENGTH), header.RequestID);
      this.DeliverRes({ header: header, body: bodyObj });
      return;
    }
    this.emit('error', new Error('no handler found'));
    return;
  }

  /**
   * 获取数据状态
   * @param data
   */
  fetchData(data: { header: SMGP_IHeader; buffer: Buffer }) {
    if (this.bufferCache.length < Utils.HEADER_LENGTH) return false;

    data.header = Utils.deCodeHeader(this.bufferCache);
    if (this.bufferCache.length < data.header.PacketLength) return false;

    data.buffer = this.bufferCache.slice(0, data.header.PacketLength);
    // socketDebug('%d receive buffer: ', data.header.RequestID, data.buffer);
    this.bufferCache = this.bufferCache.slice(data.header.PacketLength);
    return true;
  }

  /**
   * 发送上行或者状态报告
   * @param body
   */
  deliver(body: { MsgID: string; IsReport: boolean; SrcTermID: string; DestTermID: string; Content: string | SMGP_IDeliver_Report_Content }) {
    const { MsgID, IsReport, SrcTermID, DestTermID, Content } = body;
    let MsgContentStr;
    let MsgContent;
    if (typeof Content === 'string') {
      MsgContentStr = iconv.encode(Content, 'GB18030');
      MsgContent = Buffer.from(MsgContentStr);
    } else {
      MsgContent = Utils.enCodeBody(Command.Deliver_Report_Content, Content);
    }

    const buf = Utils.enCode({ SequenceID: Utils.getSequenceId(), RequestID: Command.Deliver }, { MsgID, IsReport: IsReport ? 1 : 0, MsgFormat: 15, RecvTime: '', SrcTermID, DestTermID, MsgLength: MsgContent.length, MsgContent, Reserve: '' });
    this.socket.write(buf);
  }
}
