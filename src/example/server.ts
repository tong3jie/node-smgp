import { IDeliver_Resp, ILogin, ILogin_Resp, ISubmit, ISubmit_Resp, Server, IHeader } from 'node-smgp';
const server = new Server({
  host: '127.0.0.1',
  port: 9000,
  Login: (loginMsg: { header: IHeader; body: ILogin }): ILogin_Resp => {
    console.log(loginMsg);
    return { Status: 0, AuthenticatorServer: '1', ServerVersion: 0x03 };
  },
  Submit: (submitMsg: { header: IHeader; body: ISubmit }): ISubmit_Resp => {
    console.log(submitMsg);

    return { Status: 0, MsgID: Date.now().toString() };
  },
  Deliver: (deliverMsg: { header: IHeader; body: IDeliver_Resp }) => {
    console.log(deliverMsg);
  },
});

server.start();
server.on('error', error => {
  console.log(error);
});
