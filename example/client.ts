import { Client } from '../src/index';

const client = new Client({
  host: '127.0.0.1',
  port: 9000,
  clientID: '1', //账号
  secret: 'TEST', //密码
  spId: '10668899',
  serviceId: '8899',
  srcId: '10691234', //端口号
});

client.sendSms('13301161312', '您好');
