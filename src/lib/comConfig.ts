const defConfig = {
  heartbeatInterval: 2 * 60 * 1000,
  heartbeatTimeout: 60 * 1000,
  heartbeatMaxAttempts: 3,
  timeout: 30 * 1000,
  port: 7890,
  host: '127.0.0.1',
  serviceId: 'smgpservice',
  feeCode: '100',
  PerSecond: 200,
  mpsThreshold: 1, // mobile per second threshold
  srcId: '10xxxxxx',
  ClientVersion: 0x30, // 默认为 3.0
};

const enum Command {
  'Login' = 0x00000001,
  'Login_Resp' = 0x80000001,
  'Submit' = 0x00000002,
  'Submit_Resp' = 0x80000002,
  'Deliver' = 0x00000003,
  'Deliver_Resp' = 0x80000003,
  'Active_Test' = 0x00000004,
  'Active_Test_Resp' = 0x80000004,
  'Forward' = 0x00000005,
  'Forward_Resp' = 0x80000005,
  'Exit' = 0x00000006,
  'Exit_Resp' = 0x80000006,
  'Query' = 0x00000007,
  'Query_Resp' = 0x80000007,
  'Query_TE_Route' = 0x00000008,
  'Query_TE_Route_Resp' = 0x80000008,
}

const RequestIdDes = {
  0x00000001: 'Login',
  0x80000001: 'Login_Resp',
  0x00000002: 'Submit',
  0x80000002: 'Submit_Resp',
  0x00000003: 'Deliver',
  0x80000003: 'Deliver_Resp',
  0x00000004: 'Active_Test',
  0x80000004: 'Active_Test_Resp',
  0x00000005: 'Forward',
  0x80000005: 'Forward_Resp',
  0x00000006: 'Exit',
  0x80000006: 'Exit_Resp',
  0x00000007: 'Query',
  0x80000007: 'Query_Resp',
  0x00000008: 'Query_TE_Route',
  0x80000008: 'Query_TE_Route_Resp',
};

const enum optionsTag {
  'TP_pid' = 0x0001,
  'TP_udhi' = 0x0002,
  'LinkID' = 0x0003,
  'ChargeUserType' = 0x0004,
  'ChargeTermType' = 0x0005,
  'ChargeTermPseudo' = 0x0006,
  'DestTermType' = 0x0007,
  'DestTermPseudo' = 0x0008,
  'PkTotal' = 0x0009,
  'PkNumber' = 0x000a,
  'SubmitMsgType' = 0x000b,
  'SPDealReslt' = 0x000c,
  'SrcTermType' = 0x000d,
  'SrcTermPseudo' = 0x000e,
  'NodesCount' = 0x000f,
  'MsgSrc' = 0x0010,
  'SrcType' = 0x0011,
}
const commandDes = {
  Login: [
    { name: 'ClientID', type: 'string', length: 8 },
    { name: 'AuthenticatorClient', type: 'string', length: 16 },
    { name: 'LoginMode', type: 'number', length: 1 },
    { name: 'TimeStamp', type: 'number', length: 4 },
    { name: 'ClientVersion', type: 'number', length: 1 },
  ],
  Login_Resp: [
    { name: 'Status', type: 'number', length: 4 },
    { name: 'AuthenticatorClient', type: 'string', length: 16 },
    { name: 'ServerVersion', type: 'number', length: 1 },
  ],
  Submit: [
    { name: 'MsgType', type: 'number', length: 1 },
    { name: 'NeedReport', type: 'number', length: 1 },
    { name: 'Priority', type: 'number', length: 1 },
    { name: 'ServiceID', type: 'string', length: 10 },
    { name: 'FeeType', type: 'string', length: 2 },
    { name: 'FeeCode', type: 'string', length: 6 },
    { name: 'FixedFee', type: 'string', length: 6 },
    { name: 'MsgFormat', type: 'number', length: 1 },
    { name: 'ValidTime', type: 'string', length: 17 },
    { name: 'AtTime', type: 'string', length: 17 },
    { name: 'SrcTermID', type: 'string', length: 21 },
    { name: 'ChargeTermID', type: 'string', length: 21 },
    { name: 'DestTermIDCount', type: 'number', length: 1 },
    { name: 'DestTermID', type: 'string', length: 21 },
    { name: 'MsgLength', type: 'number', length: 1 },
    { name: 'MsgContent', type: 'string', length: (obj: Record<string, any>) => obj.MsgLength.length },
    { name: 'Reserve', type: 'string', length: 8 },
    { name: 'TP_pid', type: 'number', length: 1 },
    { name: 'TP_udhi', type: 'number', length: 1 },
    { name: 'PkTotal', type: 'number', length: 1 },
    { name: 'PkNumber', type: 'number', length: 1 },
  ],
  Submit_Resp: [
    { name: 'MsgID', type: 'string', length: 10 },
    { name: 'Status', type: 'number', length: 4 },
  ],
  Deliver: [
    { name: 'MsgID', type: 'string', length: 10 },
    { name: 'IsReport', type: 'number', length: 1 },
    { name: 'MsgFormat', type: 'number', length: 1 },
    { name: 'RecvTime', type: 'string', length: 14 },
    { name: 'SrcTermID', type: 'string', length: 21 },
    { name: 'DestTermID', type: 'string', length: 21 },
    { name: 'MsgLength', type: 'number', length: 1 },
    { name: 'MsgContent', type: 'string', length: (obj: Record<string, any>) => obj.MsgLength.length },
    { name: 'Reserve', type: 'string', length: 8 },
  ],
  Deliver_Report_Cotent: [
    { name: 'MsgID', type: 'string', length: 10 },
    { name: 'sub', type: 'string', length: 3 },
    { name: 'Dlvrd', type: 'string', length: 3 },
    { name: 'Submit_date', type: 'string', length: 10 },
    { name: 'done_date', type: 'string', length: 10 },
    { name: 'Err', type: 'string', length: 3 },
    { name: 'Txt', type: 'string', length: 20 },
  ],
  Deliver_Resp: [
    { name: 'MsgID', type: 'string', length: 10 },
    { name: 'Status', type: 'number', length: 4 },
  ],
};
/**
 * 登录模式
 */
enum loginModel {
  send = 0, //发送短消息
  receive = 1, //接收短消息
  transmit = 2, //收发短消息
}

/**
 * 短消息类型
 */
enum MsgType {
  MO = 0,
  MT = 6,
  O2O = 7,
}

/**
 * 状态报告是否返回
 */
enum NeedReport {
  no = 0,
  yes = 1,
}

/**
 * 消息优先级
 */
enum Priority {
  low = 0,
  general = 1,
  better = 2,
  heigh = 3,
}

/**
 * 请求返回结果
 */
const Errors = {
  0: '成功',
  1: '系统忙',
  2: '超过最大连接数',
  10: '消息结构错',
  11: '命令字错',
  12: '序列号重复',
  20: 'IP地址错',
  21: '认证错',
  22: '版本太高',
  30: '非法消息类型（MsgType）',
  31: '非法优先级（Priority）',
  32: '非法资费类型（FeeType）',
  33: '非法资费代码（FeeCode）',
  34: '非法短消息格式（MsgFormat）',
  35: '非法时间格式',
  36: '非法短消息长度（MsgLength）',
  37: '有效期已过',
  38: '非法查询类别（QueryType）',
  39: '路由错误',
  40: '非法包月费/封顶费（FixedFee）',
  41: '非法更新类型（UpdateType）',
  42: '非法路由编号（RouteId）',
  43: '非法服务代码（ServiceId）',
  44: '非法有效期（ValidTime）',
  45: '非法定时发送时间（AtTime）',
  46: '非法发送用户号码（SrcTermId）',
  47: '非法接收用户号码（DestTermId）',
  48: '非法计费用户号码（ChargeTermId）',
  49: '非法SP服务代码（SPCode）',
  56: '非法源网关代码（SrcGatewayID）',
  57: '非法查询号码（QueryTermID）',
  58: '没有匹配路由',
  59: '非法SP类型（SPType）',
  60: '非法上一条路由编号（LastRouteID）',
  61: '非法路由类型（RouteType）',
  62: '非法目标网关代码（DestGatewayID）',
  63: '非法目标网关IP（DestGatewayIP）',
  64: '非法目标网关端口（DestGatewayPort）',
  65: '非法路由号码段（TermRangeID）',
  66: '非法终端所属省代码（ProvinceCode）',
  67: '非法用户类型（UserType）',
  68: '本节点不支持路由更新',
  69: '非法SP企业代码（SPID）',
  70: '非法SP接入类型（SPAccessType）',
  71: '路由信息更新失败',
  72: '非法时间戳（Time）',
  73: '非法业务代码（MServiceID）',
  74: 'SP禁止下发时段',
  75: 'SP发送超过日流量',
  76: 'SP帐号过有效期',
};

const Stat = {
  DELIVRD: '短消息转发成功',
  EXPIRED: '短消息超过有效期',
  DELETED: '短消息已经被删除',
  UNDELIV: '短消息是不可转发的',
  ACCEPTD: '短消息已经被最终用户接收',
  UNKNOWN: '未知短消息状态',
  REJECTD: '短消息被拒绝',
};

export { defConfig, Command, RequestIdDes, loginModel, Errors, MsgType, NeedReport, Priority, commandDes, Stat, optionsTag };
