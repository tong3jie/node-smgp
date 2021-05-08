import sleep = require('sleep-promise');
import { IDeliver_Resp, ILogin, ILogin_Resp, ISubmit, ISubmit_Resp, Server, IHeader } from '../../index';
const server = new Server({
  host: '127.0.0.1',
  port: 9000,
  LoginRes: (loginMsg: { header: IHeader; body: ILogin }): ILogin_Resp => {
    console.log(loginMsg);
    return { Status: 0, AuthenticatorServer: '1', ServerVersion: 0x03 };
  },
  SubmitRes: (submitMsg: { header: IHeader; body: ISubmit }): ISubmit_Resp => {
    console.log(submitMsg);

    return { Status: 0, MsgID: Date.now().toString() };
  },
  DeliverRes: (deliverMsg: { header: IHeader; body: IDeliver_Resp }) => {
    console.log(deliverMsg);
  },
});

server.start();
server.on('error', error => {
  console.log(error);
});

(async () => {
  await sleep(10000);
  console.log('sleep');
  server.deliver({ MsgID: '123', IsReport: 1, MsgFormat: 8, RecvTime: Date.now().toString(), SrcTermID: '10691234', DestTermID: '13301112222', MsgLength: 12, MsgContent: '123', Reserve: '' });
})();
