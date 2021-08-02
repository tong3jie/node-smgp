import { Client } from 'node-smgp';

const client = new Client({
  host: '127.0.0.1',
  port: 9000,
  clientID: '1', //账号
  secret: 'TEST', //密码
  spId: '10668899',
  serviceId: '8899',
  srcId: '10691234', //端口号
});
client.sendSms('13311112222', '您好,您已经登录设备上的 Windows Terminal 应用程序。现在可以关闭此窗口。在微服务中，定义一个服务需要特定的接口定义语言（IDL）来完成，在 gRPC中 默认使用 Protocol Buffers  作为序列化协议');

client.on('submit', submitRes => {
  console.log('submit', submitRes);
});

client.on('deliver', (deliverRes, callback) => {
  if (callback) callback();
  console.log('deliver', `${deliverRes.body.DestTermID}`);
});

client.on('timeout', (phone, content) => {
  console.log('timeout', phone.toString(), content.toString());
});

client.on('error', error => {
  console.log('error', error);
});

client.on('exit', () => {
  console.log('socket was exit');
});

client.on('connect', () => {
  console.log('socket was connected');
});
