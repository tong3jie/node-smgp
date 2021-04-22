a tool for chinatelecom smgp.

Supports Node.js >= 14.

# Quick Start

## Install

```shell
$ npm install node-smgp
```

# Client Example
## Connnect Config

```javascript
const config = {
  host: string;
  port: number;
  clientID: string;
  secret: string;
  spId: string;
  serviceId: string;
  srcId: string;
}
```

## Create Connection

```javascript
import Socket from 'node-smgp';

const SMGPSocket = new Socket({
  host: '127.0.0.1',
  port: 7789,
  clientID: 'abcdef',
  secret: 'abcdefg',
  spId: '10691234',
  serviceId: 'smgpservice',
  srcId: '10691234',
});

```

## Exit

```javascript

SMGPSocket.on('exit', exitMsg => {
  console.log(exitMsg);
});

```

## TimeOut

***send 3 times***

```javascript

SMGPSocket.on('timeout', (phone, content) => {
  console.log(phone, content);
});

````

## Deliver

```javascript

SMGPSocket.on('deliver', (Msg, callback) => {
  if (callback) callback();
  const { header, body } = Msg;
  const { SequenceID } = header;
  const { MsgID, IsReport, MsgFormat, SrcTermID, DestTermID, MsgLength, MsgContent } = body;
  switch (IsReport) {
    //状态报告
    case 1:
      db.inserte({ SequenceID, MsgID, MsgFormat, SrcTermID, DestTermID, MsgLength, MsgContent });
    //上行消息
    default:
      console.log(MsgContent);
  }
});

```

## Send SMS

```javascript

SMGPSocket.sendSms('13301171412', '【京东】您的验证码为：123456');

```

---
# Server Example

##  Create server
```javascript
import Socket from 'node-smgp';

const server = new Server({
  host: '127.0.0.1',
  port: 9000,
  // process login
  Login: (loginMsg: { header: IHeader; body: ILogin }): ILogin_Resp => {
    console.log(loginMsg);
    return { Status: 0, AuthenticatorServer: '1', ServerVersion: 0x03 };
  },
  // process submit
  Submit: (submitMsg: { header: IHeader; body: ISubmit }): ISubmit_Resp => {
    // console.log(submitMsg);

    return { Status: 0, MsgID: Date.now().toString() };
  },

  // process deliver
  Deliver: (deliverMsg: { header: IHeader; body: IDeliver_Resp }) => {
    console.log(deliverMsg);
  },
});

server.start();
server.on('error', error => {
  console.log(error);
});

```

## Questions & Suggestions

Please open an issue [here](https://github.com/tong3jie/node-smgp/issues).


