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
client.sendSms('13311112222', '您好');

client.on('submit', submitRes => {
  console.log('submit', `${submitRes.body.DestTermID}:${submitRes.body.time}`);
});

client.on('deliver', (deliverRes, callback) => {
  callback();
  console.log('submit', `${deliverRes.body.DestTermID}:${deliverRes.body.time}`);
});

client.on('error', error => {
  console.log('error', error);
});

client.on('exit', () => {
  console.log('sockt was exit');
});

client.on('connect', () => {
  console.log('sockt was connected');
});
