a tool for chinatelecom smgp.

Supports Node.js >= 14.

# Quick Start

## Install

```shell
$ npm install node-smgp
```

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

SMGPSocket.on('timeout', (command, SequenceID, body) => {
  console.log(command, SequenceID, body);
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



## Questions & Suggestions

Please open an issue [here](https://github.com/tong3jie/redis-queue-stream/issues).


